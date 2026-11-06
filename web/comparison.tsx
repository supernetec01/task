import React, { useState } from 'react';
import { useLoad, Loaded } from './ui';
import { fmt } from './api';
export function Comparison({ period }: { period: string }) {
  const [range, setRange] = useState('WEEK'),
    [mode, setMode] = useState('EQUIVALENT_DAYS');
  const { data, error } = useLoad(
    `/reports/comparison?period=${period}&range=${range}&mode=${mode}`,
  );
  return (
    <div className="panel">
      <h3>So sánh kết quả công việc</h3>
      <div className="toolbar">
        <select
          aria-label="Khoảng so sánh"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        >
          <option value="WEEK">Tuần</option>
          <option value="MONTH">Tháng</option>
        </select>
        <select aria-label="Cách so sánh" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="EQUIVALENT_DAYS">Cùng số ngày hoàn tất</option>
          <option value="FULL_PERIOD">Cả kỳ (kỳ đang chạy là tạm tính)</option>
        </select>
      </div>
      <Loaded data={data} error={error}>
        {data && (
          <>
            <p>
              {data.comparison.current} kỳ này / {data.comparison.previous} kỳ trước · Chênh lệch:{' '}
              {data.comparison.delta} task ·{' '}
              {data.comparison.delta_percent === null
                ? data.comparison.note
                : data.comparison.delta_percent.toFixed(1) + '%'}
            </p>
            <small>
              {data.note}
              <br />
              Kỳ này: {fmt(data.current_range[0])} – {fmt(data.current_range[1])}
              <br />
              Kỳ trước: {fmt(data.previous_range[0])} – {fmt(data.previous_range[1])}
            </small>
          </>
        )}
      </Loaded>
    </div>
  );
}
