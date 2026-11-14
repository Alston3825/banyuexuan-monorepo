// 把评估表和日常护理记录的字段说明书导出成 JSON，给 AI 服务的命令行试跑脚本用：
//   npx ts-node --transpile-only scripts/dump-assessment-specs.ts > specs.json
import { FORM_SPECS, allFields } from '../src/care/care-assessment/assessment-specs';
import { DAILY_AI_DESCRIPTION, dailyFlatFields, FEEDING_COLUMNS } from '../src/care/care-daily/daily-specs';

const out: Record<string, unknown> = {};
for (const [type, spec] of Object.entries(FORM_SPECS)) {
  out[type] = { title: spec.title, description: spec.aiDescription, fields: allFields(spec) };
}
out.DAILY_RECORD = {
  title: '新生儿和产妇日常护理记录',
  description: DAILY_AI_DESCRIPTION,
  fields: [...dailyFlatFields(), { key: 'feedings', label: '24小时宝宝喂养记录单', kind: 'table', columns: FEEDING_COLUMNS }],
};
console.log(JSON.stringify(out));
