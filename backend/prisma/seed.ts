/**
 * Demo seed — safe to run repeatedly.
 *
 * Everything here is FICTIONAL. Organisations, people, email addresses and
 * amounts are invented for demonstration; none of it is migrated client data.
 * Demo rows use fixed UUIDs and `upsert`, so re-running updates those rows in
 * place and never touches records you created yourself.
 *
 *   npm run seed          # add/refresh demo data
 *   npm run seed:users    # seed only the two demo accounts
 *
 * Dates are generated relative to today so the dashboard, calendar and
 * notification rules always have upcoming and overdue items to show.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/** Fixed ids keep the seed idempotent. The DEMO- prefix makes them obvious. */
const ID = {
  grantA: '11111111-1111-4111-8111-000000000001',
  grantB: '11111111-1111-4111-8111-000000000002',
  grantC: '11111111-1111-4111-8111-000000000003',
  mouA: '22222222-2222-4222-8222-000000000001',
  mouB: '22222222-2222-4222-8222-000000000002',
  msaA: '33333333-3333-4333-8333-000000000001',
  msaB: '33333333-3333-4333-8333-000000000002',
  sowA: '44444444-4444-4444-8444-000000000001',
  sowB: '44444444-4444-4444-8444-000000000002',
  settings: '55555555-5555-4555-8555-000000000001',
};

/** Today + n days, as a UTC date. */
function day(offset: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`  ${message}`);
}

async function seedUsers(): Promise<void> {
  const accounts = [
    {
      email: (process.env.SEED_ADMIN_EMAIL ?? 'admin@grantos.local').toLowerCase(),
      password: process.env.SEED_ADMIN_PASSWORD ?? 'DemoAdmin!2026',
      full_name: 'Demo Administrator',
      display_name: 'Demo Admin',
      role: 'admin' as const,
      allowed_modules: [] as string[],
      can_upload_pdf: true,
    },
    {
      email: (process.env.SEED_USER_EMAIL ?? 'analyst@grantos.local').toLowerCase(),
      password: process.env.SEED_USER_PASSWORD ?? 'DemoUser!2026',
      full_name: 'Priya Demo Analyst',
      display_name: 'Priya (Analyst)',
      role: 'user' as const,
      // Restricted on purpose: shows module-level access control in the demo.
      allowed_modules: ['Grants', 'MOUs'],
      can_upload_pdf: true,
    },
  ];

  for (const account of accounts) {
    const password_hash = await argon2.hash(account.password, { type: argon2.argon2id });
    const existing = await prisma.user.findUnique({ where: { email: account.email } });

    if (existing) {
      // Refresh profile fields but leave an operator-changed password alone.
      await prisma.user.update({
        where: { email: account.email },
        data: {
          full_name: account.full_name,
          display_name: account.display_name,
          role: account.role,
          allowed_modules: account.allowed_modules,
          can_upload_pdf: account.can_upload_pdf,
          is_active: true,
        },
      });
      log(`user kept: ${account.email} (${account.role}) — existing password preserved`);
    } else {
      await prisma.user.create({
        data: {
          email: account.email,
          password_hash,
          full_name: account.full_name,
          display_name: account.display_name,
          role: account.role,
          allowed_modules: account.allowed_modules,
          can_upload_pdf: account.can_upload_pdf,
          is_active: true,
          created_by: 'seed',
        },
      });
      log(`user created: ${account.email} (${account.role})`);
    }
  }
}

async function seedSettings(): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: ID.settings },
    update: {},
    create: {
      id: ID.settings,
      notifications_enabled: true,
      days_before: 7,
      // Fictional addresses inside the demo domain; Mailpit captures them.
      alert_emails: ['programme.office@grantos.local', 'finance.team@grantos.local'],
      environment_name: 'staging',
      environment_label_enabled: true,
      created_by: 'seed',
    },
  });
  log('app settings ready');

  const rules = [
    { key: 'milestone_due', name: 'Milestone Due Reminder', days: [15, 7, 1, 0], overdue: 7 },
    { key: 'deliverable_due', name: 'Deliverable Due Reminder', days: [7, 1, 0], overdue: 7 },
    { key: 'reporting_due', name: 'Reporting Obligation Reminder', days: [15, 7, 0], overdue: 7 },
    { key: 'payment_due', name: 'Payment / Disbursement Reminder', days: [7, 0], overdue: 7 },
    { key: 'contract_expiry', name: 'Contract / Agreement Expiry', days: [30, 15, 7], overdue: 0 },
    { key: 'document_review', name: 'Document Review Reminder', days: [], overdue: 7 },
  ] as const;

  for (const rule of rules) {
    const existing = await prisma.notificationRule.findFirst({
      where: { trigger_type: rule.key as any },
    });
    if (existing) continue;
    await prisma.notificationRule.create({
      data: {
        name: rule.name,
        trigger_type: rule.key as any,
        reminder_days_before: [...rule.days],
        overdue_frequency_days: rule.overdue,
        is_enabled: true,
        created_by: 'seed',
      },
    });
  }
  log(`${rules.length} notification rules ready`);

  const weights = [
    { parameter_key: 'milestone_completion', parameter_name: 'Milestone Completion', weightage: 30 },
    { parameter_key: 'financial_utilisation', parameter_name: 'Financial Utilisation', weightage: 25 },
    { parameter_key: 'reporting_compliance', parameter_name: 'Reporting Compliance', weightage: 20 },
    { parameter_key: 'document_completeness', parameter_name: 'Document Completeness', weightage: 15 },
    { parameter_key: 'timeline_adherence', parameter_name: 'Timeline Adherence', weightage: 10 },
  ];
  for (const w of weights) {
    await prisma.grantHealthScoreConfig.upsert({
      where: { parameter_key: w.parameter_key },
      update: {},
      create: { ...w, is_active: true, updated_by: 'seed', created_by: 'seed' },
    });
  }
  log('health score weightings ready (total 100%)');
}

async function seedGrants(): Promise<void> {
  // ── Grant A: healthy, active, with an overdue item to light up the dashboard
  await prisma.grant.upsert({
    where: { id: ID.grantA },
    update: {},
    create: {
      id: ID.grantA,
      title: 'Digital Identity Foundations Programme',
      funder: 'Meridian Development Foundation',
      grant_number: 'MDF-2025-0417',
      description:
        'Multi-year programme supporting open-source digital identity infrastructure across three pilot states. Fictional demo record.',
      total_amount: 1_250_000,
      start_date: day(-280),
      end_date: day(450),
      status: 'active',
      reporting_cycle: 'quarterly',
      notification_days_before: 7,
      contacts: [
        { name: 'Anita Raghavan', email: 'anita.raghavan@grantos.local', phone: '+91 80 4100 1200', role: 'Programme Director', organization: 'Meridian Development Foundation', contact_type: 'Funder Contact', is_active: true },
        { name: 'Daniel Okoye', email: 'daniel.okoye@grantos.local', phone: '+91 80 4100 1201', role: 'Grant Manager', organization: 'eGov Foundation', contact_type: 'Program Manager', is_active: true },
        { name: 'Finance Desk', email: 'finance.team@grantos.local', role: 'Finance', organization: 'eGov Foundation', contact_type: 'Finance', is_active: true },
      ],
      created_by: 'seed',
    },
  });

  await prisma.grant.upsert({
    where: { id: ID.grantB },
    update: {},
    create: {
      id: ID.grantB,
      title: 'Municipal Service Delivery Modernisation',
      funder: 'Helios Trust for Public Goods',
      grant_number: 'HTPG-24-118',
      description:
        'Grant supporting rollout of citizen grievance redressal tooling in 40 municipalities. Fictional demo record.',
      total_amount: 480_000,
      start_date: day(-150),
      end_date: day(25), // expires soon → triggers contract_expiry rule
      status: 'active',
      reporting_cycle: 'bi_annual',
      contacts: [
        { name: 'Grace Mutheu', email: 'grace.mutheu@grantos.local', role: 'Portfolio Lead', organization: 'Helios Trust for Public Goods', contact_type: 'Funder Contact', is_active: true },
        { name: 'Programme Office', email: 'programme.office@grantos.local', role: 'Coordination', organization: 'eGov Foundation', contact_type: 'Program Manager', is_active: true },
      ],
      created_by: 'seed',
    },
  });

  await prisma.grant.upsert({
    where: { id: ID.grantC },
    update: {},
    create: {
      id: ID.grantC,
      title: 'Open Data Capacity Building (Closed)',
      funder: 'Northwind Civic Fund',
      grant_number: 'NCF-2023-002',
      description: 'Completed capacity-building grant, retained for reporting history. Fictional demo record.',
      total_amount: 215_000,
      start_date: day(-900),
      end_date: day(-200),
      status: 'completed',
      reporting_cycle: 'annual',
      archived: true,
      contacts: [
        { name: 'Léa Fontaine', email: 'lea.fontaine@grantos.local', role: 'Grants Officer', organization: 'Northwind Civic Fund', contact_type: 'Funder Contact', is_active: false },
      ],
      created_by: 'seed',
    },
  });
  log('3 grants ready');

  const milestones = [
    { id: 'a1000001-0000-4000-8000-000000000001', grant_id: ID.grantA, title: 'Inception Report Accepted', milestone_type: 'Reporting' as const, due_date: day(-60), status: 'paid' as const, amount: 125_000, percentage: '10%' },
    { id: 'a1000001-0000-4000-8000-000000000002', grant_id: ID.grantA, title: 'Pilot State 1 Go-Live', milestone_type: 'Program' as const, due_date: day(-9), status: 'pending' as const, amount: 250_000, percentage: '20%' },
    { id: 'a1000001-0000-4000-8000-000000000003', grant_id: ID.grantA, title: 'Mid-term Review Payment', milestone_type: 'Payment' as const, due_date: day(7), status: 'pending' as const, amount: 375_000, percentage: '30%' },
    { id: 'a1000001-0000-4000-8000-000000000004', grant_id: ID.grantA, title: 'Final Evaluation Submission', milestone_type: 'Audit' as const, due_date: day(420), status: 'pending' as const, amount: 500_000, percentage: '40%' },
    { id: 'a1000001-0000-4000-8000-000000000005', grant_id: ID.grantB, title: 'Municipality Cohort 1 Onboarded', milestone_type: 'Program' as const, due_date: day(1), status: 'pending' as const, amount: 160_000, percentage: '33%' },
  ];
  for (const m of milestones) {
    await prisma.milestone.upsert({
      where: { id: m.id },
      update: {},
      create: { ...m, currency: 'USD', created_by: 'seed' },
    });
  }

  const deliverables = [
    { id: 'a2000001-0000-4000-8000-000000000001', grant_id: ID.grantA, name: 'Identity Resolution Service v1', category: 'Technical' as const, due_date: day(-3), status: 'in_progress' as const, priority: 'High' as const, phase: 'Phase 1' },
    { id: 'a2000001-0000-4000-8000-000000000002', grant_id: ID.grantA, name: 'Data Protection Impact Assessment', category: 'Compliance' as const, due_date: day(14), status: 'pending' as const, priority: 'High' as const, phase: 'Phase 1' },
    { id: 'a2000001-0000-4000-8000-000000000003', grant_id: ID.grantA, name: 'Field Operations Handbook', category: 'Documentation' as const, due_date: day(60), status: 'pending' as const, priority: 'Medium' as const, phase: 'Phase 2' },
    { id: 'a2000001-0000-4000-8000-000000000004', grant_id: ID.grantB, name: 'Grievance Workflow Configuration Pack', category: 'Technical' as const, due_date: day(7), status: 'pending' as const, priority: 'High' as const },
  ];
  for (const d of deliverables) {
    await prisma.grantDeliverable.upsert({
      where: { id: d.id },
      update: {},
      create: { ...d, description: `${d.name} — fictional demo deliverable.`, created_by: 'seed' },
    });
  }

  const tranches = [
    { id: 'a3000001-0000-4000-8000-000000000001', grant_id: ID.grantA, tranche_name: 'Tranche 1 — Mobilisation', amount: 125_000, invoice_trigger_date: day(-250), due_date: day(-235), invoice_date: day(-248), received_date: day(-230), status: 'received' as const },
    { id: 'a3000001-0000-4000-8000-000000000002', grant_id: ID.grantA, tranche_name: 'Tranche 2 — Pilot Delivery', amount: 375_000, invoice_trigger_date: day(0), due_date: day(21), status: 'pending' as const },
    { id: 'a3000001-0000-4000-8000-000000000003', grant_id: ID.grantA, tranche_name: 'Tranche 3 — Scale-up', amount: 500_000, invoice_trigger_date: day(200), due_date: day(230), status: 'pending' as const },
    { id: 'a3000001-0000-4000-8000-000000000004', grant_id: ID.grantB, tranche_name: 'Tranche 1 — Inception', amount: 160_000, invoice_trigger_date: day(-14), due_date: day(-7), status: 'invoiced' as const },
  ];
  for (const t of tranches) {
    await prisma.grantTranche.upsert({
      where: { id: t.id },
      update: {},
      create: { ...t, created_by: 'seed' },
    });
  }

  const obligations = [
    { id: 'a4000001-0000-4000-8000-000000000001', grant_id: ID.grantA, obligation_name: 'Q3 Narrative & Financial Report', obligation_type: 'Quarterly_Report' as const, due_date: day(-5), status: 'Overdue' as const },
    { id: 'a4000001-0000-4000-8000-000000000002', grant_id: ID.grantA, obligation_name: 'Q4 Narrative & Financial Report', obligation_type: 'Quarterly_Report' as const, due_date: day(15), status: 'Pending' as const },
    { id: 'a4000001-0000-4000-8000-000000000003', grant_id: ID.grantA, obligation_name: 'Annual Audited Statements', obligation_type: 'Audit_Submission' as const, due_date: day(120), status: 'Pending' as const },
    { id: 'a4000001-0000-4000-8000-000000000004', grant_id: ID.grantB, obligation_name: 'Half-Yearly Progress Report', obligation_type: 'Annual_Report' as const, due_date: day(7), status: 'Pending' as const },
  ];
  for (const o of obligations) {
    await prisma.grantReportingObligation.upsert({
      where: { id: o.id },
      update: {},
      create: { ...o, created_by: 'seed' },
    });
  }

  log(`${milestones.length} milestones, ${deliverables.length} deliverables, ${tranches.length} tranches, ${obligations.length} reporting obligations`);
}

async function seedAgreements(): Promise<void> {
  await prisma.mou.upsert({
    where: { id: ID.mouA },
    update: {},
    create: {
      id: ID.mouA,
      title: 'MoU with Riverstone State Digital Mission',
      partner_name: 'Riverstone State Digital Mission',
      mou_number: 'MOU-2025-007',
      partner_type: 'government',
      partner_contact_name: 'Sanjay Deshpande',
      partner_contact_email: 'sanjay.deshpande@grantos.local',
      partner_signatory_name: 'Dr. Vimala Rao',
      partner_signatory_designation: 'Mission Director',
      our_contact_name: 'Daniel Okoye',
      our_contact_email: 'daniel.okoye@grantos.local',
      signed_date: day(-120),
      effective_date: day(-120),
      end_date: day(610),
      initial_term_years: 2,
      review_cycle: 'annual',
      status: 'active',
      purpose: 'Joint implementation of citizen-facing digital services. Fictional demo record.',
      governing_law: 'Laws of India',
      contacts: [
        { name: 'Sanjay Deshpande', email: 'sanjay.deshpande@grantos.local', role: 'Nodal Officer', organization: 'Riverstone State Digital Mission', contact_type: 'Partner Contact', is_active: true },
        { name: 'Daniel Okoye', email: 'daniel.okoye@grantos.local', role: 'Partnership Lead', organization: 'eGov Foundation', contact_type: 'Our Contact', is_active: true },
      ],
      created_by: 'seed',
    },
  });

  await prisma.mou.upsert({
    where: { id: ID.mouB },
    update: {},
    create: {
      id: ID.mouB,
      title: 'MoU with Kestrel Institute of Public Policy',
      partner_name: 'Kestrel Institute of Public Policy',
      mou_number: 'MOU-2024-019',
      partner_type: 'academic',
      our_contact_name: 'Anita Raghavan',
      our_contact_email: 'anita.raghavan@grantos.local',
      signed_date: day(-400),
      effective_date: day(-400),
      end_date: day(20), // expiring soon
      initial_term_years: 1,
      review_cycle: 'annual',
      status: 'active',
      purpose: 'Research collaboration on measurement frameworks. Fictional demo record.',
      contacts: [
        { name: 'Prof. Helena Marsh', email: 'helena.marsh@grantos.local', role: 'Principal Investigator', organization: 'Kestrel Institute of Public Policy', contact_type: 'Partner Contact', is_active: true },
      ],
      created_by: 'seed',
    },
  });

  const commitments = [
    { id: 'b1000001-0000-4000-8000-000000000001', mou_id: ID.mouA, name: 'Quarterly joint review meeting', commitment_type: 'Governance' as const, responsible_party: 'Both_Parties' as const, due_date: day(10), frequency: 'Quarterly', status: 'pending' as const },
    { id: 'b1000001-0000-4000-8000-000000000002', mou_id: ID.mouA, name: 'Provision of state data-sharing APIs', commitment_type: 'Operational' as const, responsible_party: 'Partner' as const, due_date: day(-2), status: 'in_progress' as const },
    { id: 'b1000001-0000-4000-8000-000000000003', mou_id: ID.mouB, name: 'Publish joint research brief', commitment_type: 'Reporting' as const, responsible_party: 'Both_Parties' as const, due_date: day(30), status: 'pending' as const },
  ];
  for (const c of commitments) {
    await prisma.mouCommitment.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, description: `${c.name} — fictional demo commitment.`, created_by: 'seed' },
    });
  }

  await prisma.msa.upsert({
    where: { id: ID.msaA },
    update: {},
    create: {
      id: ID.msaA,
      title: 'MSA with Lumen Software Services',
      vendor_name: 'Lumen Software Services Pvt Ltd',
      msa_number: 'MSA-2024-031',
      vendor_contact_name: 'Rahul Menon',
      vendor_contact_email: 'rahul.menon@grantos.local',
      our_contact_name: 'Daniel Okoye',
      our_contact_email: 'daniel.okoye@grantos.local',
      effective_date: day(-300),
      end_date: day(430),
      initial_term_years: 2,
      status: 'active',
      governing_law: 'Laws of India',
      auto_renew: true,
      notice_period: '60 days',
      liability_cap: '12 months of fees paid',
      ip_ownership: 'Work product assigned to client; vendor retains pre-existing IP',
      structured_services: [
        { service_category: 'Platform Engineering', description: 'Design and build of backend services.', responsibility: 'Vendor', source_section: 'Schedule A', source_clause: '2.1' },
        { service_category: 'Support & Maintenance', description: 'L2/L3 support during business hours.', responsibility: 'Vendor', source_section: 'Schedule A', source_clause: '2.4' },
      ],
      contacts: [
        { name: 'Rahul Menon', email: 'rahul.menon@grantos.local', role: 'Account Director', organization: 'Lumen Software Services Pvt Ltd', contact_type: 'Vendor Contact', is_active: true },
      ],
      created_by: 'seed',
    },
  });

  await prisma.msa.upsert({
    where: { id: ID.msaB },
    update: {},
    create: {
      id: ID.msaB,
      title: 'MSA with Atlas Advisory Partners',
      vendor_name: 'Atlas Advisory Partners LLP',
      msa_number: 'MSA-2025-008',
      effective_date: day(-60),
      end_date: day(670),
      status: 'active',
      notice_period: '30 days',
      contacts: [
        { name: 'Miriam Haddad', email: 'miriam.haddad@grantos.local', role: 'Engagement Partner', organization: 'Atlas Advisory Partners LLP', contact_type: 'Vendor Contact', is_active: true },
      ],
      created_by: 'seed',
    },
  });

  const clauses = [
    { id: 'c1000001-0000-4000-8000-000000000001', msa_id: ID.msaA, clause_title: 'Limitation of Liability', clause_type: 'Risk' as const, clause_number: '11.2', risk_level: 'High' as const, obligation_owner: 'Both', amount_or_cap: '12 months fees', summary: 'Aggregate liability capped at fees paid in the preceding twelve months.' },
    { id: 'c1000001-0000-4000-8000-000000000002', msa_id: ID.msaA, clause_title: 'Termination for Convenience', clause_type: 'Legal' as const, clause_number: '14.1', risk_level: 'Medium' as const, obligation_owner: 'Both', notice_period_days: '60', summary: 'Either party may terminate on sixty days written notice.' },
    { id: 'c1000001-0000-4000-8000-000000000003', msa_id: ID.msaA, clause_title: 'Data Protection and Confidentiality', clause_type: 'Compliance' as const, clause_number: '9.3', risk_level: 'High' as const, obligation_owner: 'Vendor', summary: 'Vendor must process personal data only on documented instructions.' },
  ];
  for (const c of clauses) {
    await prisma.msaKeyClause.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, full_text: `${c.summary} (Fictional demo clause text.)`, created_by: 'seed' },
    });
  }

  await prisma.sow.upsert({
    where: { id: ID.sowA },
    update: {},
    create: {
      id: ID.sowA,
      title: 'SOW-01 — Identity Service Build',
      vendor_name: 'Lumen Software Services Pvt Ltd',
      sow_number: 'SOW-01',
      grant_id: ID.grantA,
      msa_id: ID.msaA,
      vendor_email: 'rahul.menon@grantos.local',
      description: 'Build and deploy the identity resolution service. Fictional demo record.',
      start_date: day(-200),
      end_date: day(160),
      status: 'active',
      monthly_rate: 42_000,
      total_value: 504_000,
      payment_day: 15,
      personnel: [
        { name: 'A. Kulkarni', role: 'Tech Lead', rate_per_month: 14_000, allocation_percent: 100 },
        { name: 'S. Banerjee', role: 'Backend Engineer', rate_per_month: 10_500, allocation_percent: 100 },
        { name: 'T. Oyelaran', role: 'QA Engineer', rate_per_month: 8_000, allocation_percent: 50 },
      ],
      contacts: [
        { name: 'Rahul Menon', email: 'rahul.menon@grantos.local', role: 'Account Director', organization: 'Lumen Software Services Pvt Ltd', contact_type: 'Vendor Contact', is_active: true },
        { name: 'Daniel Okoye', email: 'daniel.okoye@grantos.local', role: 'Project Manager', organization: 'eGov Foundation', contact_type: 'Our Contact', is_active: true },
      ],
      created_by: 'seed',
    },
  });

  await prisma.sow.upsert({
    where: { id: ID.sowB },
    update: {},
    create: {
      id: ID.sowB,
      title: 'SOW-02 — Programme Evaluation Support',
      vendor_name: 'Atlas Advisory Partners LLP',
      sow_number: 'SOW-02',
      grant_id: ID.grantB,
      msa_id: ID.msaB,
      description: 'Independent evaluation and reporting support. Fictional demo record.',
      start_date: day(-40),
      end_date: day(200),
      status: 'active',
      monthly_rate: 18_000,
      total_value: 144_000,
      payment_day: 1,
      contacts: [
        { name: 'Miriam Haddad', email: 'miriam.haddad@grantos.local', role: 'Engagement Partner', organization: 'Atlas Advisory Partners LLP', contact_type: 'Vendor Contact', is_active: true },
      ],
      created_by: 'seed',
    },
  });

  const sowMilestones = [
    { id: 'd1000001-0000-4000-8000-000000000001', sow_id: ID.sowA, title: 'Architecture Sign-off', milestone_type: 'Review' as const, due_date: day(-150), status: 'paid' as const, amount: 84_000 },
    { id: 'd1000001-0000-4000-8000-000000000002', sow_id: ID.sowA, title: 'Beta Release', milestone_type: 'Release' as const, due_date: day(0), status: 'pending' as const, amount: 168_000 },
    { id: 'd1000001-0000-4000-8000-000000000003', sow_id: ID.sowB, title: 'Baseline Study Delivered', milestone_type: 'Delivery' as const, due_date: day(21), status: 'pending' as const, amount: 36_000 },
  ];
  for (const m of sowMilestones) {
    await prisma.sowMilestone.upsert({
      where: { id: m.id },
      update: {},
      create: { ...m, currency: 'USD', created_by: 'seed' },
    });
  }

  const sowDeliverables = [
    { id: 'd2000001-0000-4000-8000-000000000001', sow_id: ID.sowA, name: 'API Specification Document', category: 'Documentation' as const, due_date: day(-100), status: 'completed' as const },
    { id: 'd2000001-0000-4000-8000-000000000002', sow_id: ID.sowA, name: 'Deployed Staging Environment', category: 'Deployment' as const, due_date: day(5), status: 'in_progress' as const, priority: 'High' as const },
    { id: 'd2000001-0000-4000-8000-000000000003', sow_id: ID.sowB, name: 'Evaluation Framework', category: 'Reporting' as const, due_date: day(14), status: 'pending' as const },
  ];
  for (const d of sowDeliverables) {
    await prisma.sowDeliverable.upsert({
      where: { id: d.id },
      update: {},
      create: { ...d, description: `${d.name} — fictional demo deliverable.`, created_by: 'seed' },
    });
  }

  const invoices = [
    { id: 'd3000001-0000-4000-8000-000000000001', sow_id: ID.sowA, invoice_number: 'LUM-2025-0041', period: 'Previous month', amount: 42_000, invoice_date: day(-35), due_date: day(-5), status: 'overdue' as const },
    { id: 'd3000001-0000-4000-8000-000000000002', sow_id: ID.sowA, invoice_number: 'LUM-2025-0042', period: 'Current month', amount: 42_000, invoice_date: day(-5), due_date: day(25), status: 'sent' as const },
    { id: 'd3000001-0000-4000-8000-000000000003', sow_id: ID.sowB, invoice_number: 'ATL-2025-0009', period: 'Current month', amount: 18_000, invoice_date: day(-2), due_date: day(28), status: 'draft' as const },
  ];
  for (const i of invoices) {
    await prisma.sowInvoice.upsert({
      where: { id: i.id },
      update: {},
      create: { ...i, created_by: 'seed' },
    });
  }

  log('2 MoUs, 2 MSAs, 2 SOWs with commitments, clauses, milestones, deliverables and invoices');
}

async function main(): Promise<void> {
  const usersOnly = process.argv.includes('--users-only');

  // eslint-disable-next-line no-console
  console.log('\nSeeding GrantOS demo data (fictional — not client records)\n');

  await seedUsers();
  if (usersOnly) {
    // eslint-disable-next-line no-console
    console.log('\nDone (users only).\n');
    return;
  }

  await seedSettings();
  await seedGrants();
  await seedAgreements();

  const counts = {
    grants: await prisma.grant.count(),
    mous: await prisma.mou.count(),
    msas: await prisma.msa.count(),
    sows: await prisma.sow.count(),
    milestones: await prisma.milestone.count(),
    users: await prisma.user.count(),
  };

  // eslint-disable-next-line no-console
  console.log(
    `\nDone. Database now holds: ${counts.grants} grants, ${counts.mous} MoUs, ` +
      `${counts.msas} MSAs, ${counts.sows} SOWs, ${counts.milestones} milestones, ${counts.users} users.\n` +
      'Re-running this command is safe — demo rows are upserted, your own records are untouched.\n',
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('\nSeed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
