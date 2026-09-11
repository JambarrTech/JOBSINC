const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$queryRawUnsafe(`
    SELECT
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      c.character_maximum_length
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'Company'
    ORDER BY c.ordinal_position;
  `);
  console.table(result);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
