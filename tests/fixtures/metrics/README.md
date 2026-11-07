# Synthetic import fixture

This file is generated for regression tests. It is not a TikTok or Shopee export and contains no company information.

Mapping: sheet1, header_row 1, date_column 0, gmv 1, orders 2, en-US, DAY, SHOP, VND. Expected: six metric rows, one excluded Total row, one missing GMV, explicit zero preserved. The API test checks duplicate source bytes, stale preview rejection, commit and original-source download; it also generates a synthetic Shopee XLSX workbook.

These tests do not establish real export headers, workbook layout, account attribution or reconciliation. Real anonymized source files and confirmed mappings are still required for business acceptance. Shop GMV must stay separate from video/employee revenue; unique/ratio/cumulative values must retain their grain.
