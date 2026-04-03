import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/voice_agent';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const interviewTemplates = [
  {
    id: "tech-round",
    title: "Senior Frontend Developer",
    description: "Deep dive into React, System Design, and CSS architecture.",
    duration: "45 min",
    difficulty: "Hard",
    icon: "Code",
    color: "bg-blue-500/10 text-blue-500",
    type: "Technical",
  },
  {
    id: "aptitude-round",
    title: "Aptitude & DSA",
    description: "Data structures, algorithms, and logic puzzles.",
    duration: "30 min",
    difficulty: "Medium",
    icon: "Brain",
    color: "bg-purple-500/10 text-purple-500",
    type: "Aptitude",
  },
  {
    id: "hr-round",
    title: "HR & Culture Fit",
    description: "Behavioral questions, conflict resolution, and career goals.",
    duration: "30 min",
    difficulty: "Easy",
    icon: "Users",
    color: "bg-green-500/10 text-green-500",
    type: "Behavioral",
  },
  {
    id: "system-design",
    title: "System Design",
    description: "Architecture, scalability, and distributed systems analysis.",
    duration: "60 min",
    difficulty: "Hard",
    icon: "Server",
    color: "bg-orange-500/10 text-orange-500",
    type: "Technical",
  },
  {
    id: "manager-behavioral",
    title: "Engineering Manager",
    description: "Leadership scenarios, unblocking teams, and velocity mapping.",
    duration: "45 min",
    difficulty: "Medium",
    icon: "Briefcase",
    color: "bg-pink-500/10 text-pink-500",
    type: "Behavioral",
  }
];

async function main() {
  console.log(`Starting seed...`);

  // Ensure we have a default user for linking things
  const demoHash = await bcrypt.hash('password123', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {
      password_hash: demoHash
    },
    create: {
      name: 'Demo User',
      email: 'demo@example.com',
      password_hash: demoHash,
      role: 'admin',
      isVerified: true,
    },
  });
  console.log(`Created default user: ${demoUser.name} (${demoUser.email})`);

  // Seed Templates
  for (const t of interviewTemplates) {
    const template = await prisma.interviewTemplate.upsert({
      where: { id: t.id },
      update: t,
      create: t,
    });
    console.log(`Upserted template: ${template.title} [${template.id}]`);
  }

  console.log(`Seeding finished successfully.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
