import { FORM_SPECS, allFields, columnName, FieldSpec } from '../src/care/care-assessment/assessment-specs';

const prismaType = (f: FieldSpec): string => {
  switch (f.kind) {
    case 'text':
    case 'single':
      return 'String?';
    case 'longtext':
      return 'String? @db.Text';
    case 'int':
      return 'Int?';
    case 'decimal':
      return 'Float?';
    case 'date':
      return 'DateTime? @db.Date';
    case 'multi':
      return 'Json?';
  }
};

const names: Record<string, { model: string; table: string; subject: 'MOTHER' | 'BABY' }> = {
  MOTHER_ADMISSION: { model: 'CareMotherAdmission', table: 'care_mother_admissions', subject: 'MOTHER' },
  BABY_ADMISSION: { model: 'CareBabyAdmission', table: 'care_baby_admissions', subject: 'BABY' },
  MOTHER_DISCHARGE: { model: 'CareMotherDischarge', table: 'care_mother_discharges', subject: 'MOTHER' },
  BABY_DISCHARGE: { model: 'CareBabyDischarge', table: 'care_baby_discharges', subject: 'BABY' },
};

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(1, n - s.length));
let out = '';
for (const [type, spec] of Object.entries(FORM_SPECS)) {
  const n = names[type];
  const fkField = n.subject === 'MOTHER' ? 'motherProfileId' : 'babyProfileId';
  const fkRel = n.subject === 'MOTHER' ? 'motherProfile MotherProfile' : 'babyProfile BabyProfile';
  const lines: string[] = [];
  lines.push(`  id ${' '.repeat(0)}String @id @default(cuid())`);
  lines.push(`  tenantId String @map("tenant_id")`);
  lines.push(`  storeId String @map("store_id")`);
  lines.push(`  ${fkField} String @map("${columnName(fkField)}")`);
  lines.push(`  documentId String? @map("document_id") // 对应的纸质原件照片（可为空：手工录入时没拍照）`);
  lines.push(`  // —— 以下是纸质表上的字段（由 care-assessment/assessment-specs.ts 生成）——`);
  for (const f of allFields(spec)) {
    lines.push(`  ${f.key} ${prismaType(f)} @map("${columnName(f.key)}") // ${f.label}`);
  }
  lines.push(`  createdBy String @map("created_by")`);
  lines.push(`  createdAt DateTime @default(now()) @map("created_at")`);
  lines.push(`  updatedAt DateTime @updatedAt @map("updated_at")`);
  lines.push(`  version Int @default(0)`);
  lines.push('');
  lines.push(`  ${fkRel} @relation(fields: [${fkField}], references: [id])`);
  lines.push(`  document CareDocument? @relation(fields: [documentId], references: [id])`);
  lines.push('');
  lines.push(`  @@unique([${fkField}])`);
  lines.push(`  @@index([tenantId, storeId])`);
  lines.push(`  @@map("${n.table}")`);
  out += `/// ${spec.title}：一个${n.subject === 'MOTHER' ? '妈妈' : '宝宝'}档案一份（单次评估，可修改，修改留审计记录）。\nmodel ${n.model} {\n${lines.join('\n')}\n}\n\n`;
}
console.log(out);
