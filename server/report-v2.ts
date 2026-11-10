import { type Actor, type DB, rows, one, need, hasJob, localDate, setting } from './base.js';
import { specialistJobs, resourceAccess } from './handoff-access.js';
import { d7Performance } from './content.js';
import { periodRange, counts } from './reports.js';

export async function snapshotV2(c: DB, a: Actor, period: string) {
  const { start, end } = periodRange(period),
    cutoff = new Date(),
    roles = specialistJobs.filter((j) => hasJob(a, j));
  need(roles.length, 'Cần chuyên môn còn hiệu lực', 403, 'FORBIDDEN');
  const eventRows = await rows(
    c,
    `SELECT e.* FROM task_events e JOIN tasks t ON t.id=e.task_id WHERE e.created_at>=$2 AND e.created_at<$3 AND ((e.data->>'owner_at_event')=$1 OR e.data->'after'->>'owner_id'=$1 OR (e.data->>'owner_at_event' IS NULL AND t.owner_id::text=$1)) ORDER BY e.created_at,e.id`,
    [a.id, start, end],
  );
  const tasks = await rows(
    c,
    `SELECT t.id,t.code,t.title,t.owner_id,t.role,t.status,t.flow_mode,t.due_at,t.created_at,t.completed_at,t.cancelled_at,t.started_at,t.timing,t.version,t.result_text,t.next_step,t.blocker,u.name AS owner_name FROM tasks t JOIN users u ON u.id=t.owner_id WHERE t.role=ANY($2) AND t.created_at<$3 AND (t.owner_id=$1 OR t.id=ANY($4::uuid[])) ORDER BY t.created_at,t.id`,
    [a.id, roles, end, eventRows.map((e) => e.task_id)],
  );
  const principal = tasks.filter((t) => t.owner_id === a.id && t.created_at >= start);
  const completionEvents = eventRows.filter(
    (e) =>
      (e.action === 'COMPLETED' || (e.action === 'REVIEW' && e.data.decision === 'APPROVE')) &&
      e.data.owner_at_event === a.id,
  );
  const completionIds = new Set(completionEvents.map((e) => e.task_id));
  const completed = tasks
    .filter((t) => completionIds.has(t.id))
    .map((t) => {
      const e = completionEvents.filter((e) => e.task_id === t.id).at(-1);
      return {
        ...t,
        timing_at_completion: e?.data.timing_at_event || t.timing || null,
        completion_at: e?.data.completed_at_event || e?.created_at,
      };
    });
  const completionSummary = (items: any[]) => ({
    done: items.length,
    on_time: items.filter((t) => t.timing_at_completion === 'ON_TIME').length,
    late: items.filter((t) => t.timing_at_completion === 'LATE').length,
    unknown_timing: items.filter((t) => !t.timing_at_completion).length,
  });
  const carryover = tasks.filter(
    (t) =>
      t.created_at < start &&
      t.owner_id === a.id &&
      !['DONE', 'CANCELLED', 'DECLINED'].includes(t.status),
  );
  const cancelled = tasks.filter((t) =>
    eventRows.some((e) => e.task_id === t.id && e.action === 'CANCELLED'),
  );
  const task_sections = {
    created_in_period: principal,
    completed_in_period: completed,
    completion_events: completionEvents,
    completion_event_count: completionEvents.length,
    currently_done: completed.filter((t) => t.status === 'DONE'),
    reopened_in_period: eventRows.filter((e) => e.action === 'REOPENED'),
    open_carryover: carryover,
    cancelled_in_period: cancelled,
    activity_in_period: eventRows,
    unique_tasks: [
      ...new Set([...principal, ...completed, ...carryover, ...cancelled].map((t) => t.id)),
    ],
    legacy_availability: 'LEGACY_UNVERIFIED',
  };
  const professional: any[] = [];
  const sources: any[] = [];
  if (roles.includes('MARKETPLACE')) {
    const resources = await rows(
      c,
      "SELECT id FROM business_resources WHERE kind='SHOP' ORDER BY id",
    );
    for (const resource of resources) {
      try {
        await resourceAccess(c, a, resource.id);
      } catch (e: any) {
        if (e.code === 'NOT_FOUND') continue;
        throw e;
      }
      const partitions = await rows(
        c,
        `SELECT p.*,r.canonical_hash,r.batch_id FROM source_partitions p JOIN source_revisions r ON r.id=p.current_revision_id WHERE p.resource_id=$1 AND p.period_start<=$3 AND p.period_end>=$2`,
        [resource.id, period, localDate(new Date(+end - 1))],
      );
      for (const currency of [...new Set(partitions.map((p) => p.currency))]) {
        const sales = await one(
          c,
          `SELECT sum(f.revenue)::text AS revenue,sum(f.orders)::text AS orders,count(DISTINCT f.business_date)::int AS days FROM sales_daily_facts f JOIN source_partitions p ON p.current_revision_id=f.source_revision_id WHERE p.resource_id=$1 AND p.currency=$4 AND f.business_date>=$2 AND f.business_date<$3`,
          [resource.id, period, localDate(end), currency],
        );
        const koc = await one(
          c,
          `SELECT sum(f.gmv)::text AS gmv,sum(f.estimated_commission)::text AS estimated_commission FROM koc_period_facts f JOIN source_partitions p ON p.current_revision_id=f.source_revision_id WHERE p.resource_id=$1 AND p.currency=$4 AND p.period_start=$2 AND p.period_end=$3`,
          [resource.id, period, localDate(new Date(+end - 1)), currency],
        );
        professional.push({
          role: 'MARKETPLACE',
          resource_id: resource.id,
          currency,
          sales: {
            ...sales,
            availability:
              sales.days === 7 ? 'AVAILABLE' : sales.days ? 'INCOMPLETE' : 'MISSING_SOURCE',
          },
          koc: { ...koc, availability: koc.gmv !== null ? 'AVAILABLE' : 'UNCONFIRMED_PERIOD' },
          paid_commission: { value: null, availability: 'MISSING_SOURCE' },
        });
      }
      sources.push(
        ...partitions.map((p) => ({
          partition_id: p.id,
          revision_id: p.current_revision_id,
          batch_id: p.batch_id,
          hash: p.canonical_hash,
        })),
      );
    }
    if (!professional.length)
      professional.push({
        role: 'MARKETPLACE',
        availability: 'MISSING_SOURCE',
        revenue: null,
        gmv: null,
        missing_reason: 'Chưa có nguồn shop được cấp quyền',
      });
  }
  if (roles.includes('CONTENT')) {
    const stages = await rows(
      c,
      `SELECT e.* FROM content_stage_events e WHERE e.credited_user_id=$1 AND e.business_at>=$2 AND e.business_at<$3 AND NOT EXISTS(SELECT 1 FROM content_stage_events newer WHERE newer.supersedes_id=e.id AND newer.created_at<=$4) AND e.kind IN ('COMPLETE','CORRECT') ORDER BY e.business_at,e.id`,
      [a.id, start, end, cutoff],
    );
    const pubs = await rows(
      c,
      `SELECT id,content_id,published_at,channel_id FROM publications WHERE publisher_id=$1 AND published_at>=$2 AND published_at<$3`,
      [a.id, start, end],
    );
    const windowPublications = await rows(
      c,
      `SELECT DISTINCT p.* FROM publications p LEFT JOIN video_window_facts w ON w.publication_id=p.id WHERE p.publisher_id=$1 AND ((p.published_at>=$2 AND p.published_at<$3) OR (w.window_end>=$2 AND w.window_end<$3))`,
      [a.id, start, end],
    );
    const windows = [];
    for (const p of windowPublications) {
      const performance = await d7Performance(c, p);
      windows.push({ publication_id: p.id, ...performance.d7 });
    }
    const windowSources = await rows(
      c,
      `SELECT DISTINCT p.id AS partition_id,r.id AS revision_id,r.batch_id,r.canonical_hash AS hash FROM video_window_facts w JOIN publications pub ON pub.id=w.publication_id JOIN source_revisions r ON r.id=w.source_revision_id JOIN source_partitions p ON p.current_revision_id=r.id WHERE pub.publisher_id=$1 AND w.window_end>=$2 AND w.window_end<$3`,
      [a.id, start, end],
    );
    sources.push(...windowSources);
    professional.push({
      role: 'CONTENT',
      scripts_completed: stages.filter((e) => e.stage_code === 'SCRIPT').length,
      shoots_completed: stages.filter((e) => e.stage_code === 'SHOOT').length,
      clips_completed: stages.filter((e) => e.stage_code === 'EDIT').length,
      publications: pubs,
      stage_events: stages.map(({ snapshot, ...e }) => e),
      video_d7: {
        gmv: null,
        windows,
        availability: windows.some((w) => w.status === 'READY') ? 'AVAILABLE' : 'MISSING_SOURCE',
        missing_reason: windows.some((w) => w.status === 'READY')
          ? null
          : 'G01: Cần nguồn đúng cửa sổ 168 giờ',
      },
    });
  }
  if (roles.includes('HR')) {
    const interviews = await one(
      c,
      'SELECT count(*)::int AS count FROM interview_sessions i WHERE starts_at>=$1 AND starts_at<$2 AND (EXISTS(SELECT 1 FROM interview_users iu WHERE iu.interview_id=i.id AND iu.user_id=$3) OR EXISTS(SELECT 1 FROM job_applications j WHERE j.id=i.application_id AND j.recruiter_id=$3))',
      [start, end, a.id],
    );
    const hires = await one(
      c,
      'SELECT count(*)::int AS count FROM employee_profiles WHERE joined_on>=$1 AND joined_on<$2 AND (recruiter_id=$3 OR (recruiter_id IS NULL AND created_by=$3))',
      [period, localDate(end), a.id],
    );
    const contracts = await one(
      c,
      'SELECT count(*)::int AS count FROM employee_contract_revisions WHERE created_by=$1 AND created_at>=$2 AND created_at<$3',
      [a.id, start, end],
    );
    professional.push({
      role: 'HR',
      interviews: interviews.count,
      hires: hires.count,
      contracts: contracts.count,
    });
  }
  const narratives = await rows(
    c,
    "SELECT role,narrative,version FROM report_drafts WHERE user_id=$1 AND period=$2 AND (role=ANY($3) OR role='COMMON')",
    [a.id, period, roles],
  );
  const policy = await setting(c, 'handoff_policies');
  return {
    schema_version: 2,
    user_id: a.id,
    user_name: a.name,
    period,
    start,
    end,
    cutoff,
    timezone: 'Asia/Ho_Chi_Minh',
    policy_version: policy.version || 1,
    policy_confirmed: true,
    roles,
    summary: { ...counts(principal), ...completionSummary(completed) },
    principal,
    support: [],
    carryover,
    narratives,
    sections: roles.map((role) => ({
      role,
      summary: {
        ...counts(principal.filter((t) => t.role === role)),
        ...completionSummary(completed.filter((t) => t.role === role)),
      },
      support: [],
      metrics: [],
      activity: [],
      claims: [],
    })),
    comparison: null,
    task_sections,
    professional_sections: professional,
    source_manifest: {
      sources,
      event_ids: eventRows.map((e) => e.id),
      policy_version: policy.version || 1,
    },
    availability: professional.some((p) =>
      [
        p.availability,
        p.sales?.availability,
        p.koc?.availability,
        p.video_d7?.availability,
        p.paid_commission?.availability,
      ]
        .filter(Boolean)
        .some((s) => s !== 'AVAILABLE'),
    )
      ? 'INCOMPLETE'
      : 'AVAILABLE',
    submitted_late:
      +cutoff >
      +end + (policy.report_due_hour ?? 10) * 3600e3 + (policy.report_due_minute ?? 0) * 60000,
  };
}
