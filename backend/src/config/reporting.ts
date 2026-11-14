/**
 * Official places to report a suspected payment fraud in India. Sources,
 * checked 14 Nov 2026:
 * - https://sancharsaathi.gov.in/sfc/ : "If you have already lost money, please
 *   report at cyber crime helpline 1930 or cybercrime.gov.in."
 * - https://sancharsaathi.gov.in/sfc/ : Chakshu is for "suspected fraud
 *   communications ... through Call, SMS or WhatsApp".
 * - https://cms.rbi.org.in/ : RBI Complaint Management System (Integrated
 *   Ombudsman Scheme), for complaints against a bank or other regulated entity.
 */
export const REPORTING_CHANNELS = [
  {
    id: 'cybercrime',
    name: 'National Cyber Crime Reporting Portal',
    url: 'https://cybercrime.gov.in/',
    when: 'You lost money or were targeted by an online financial fraud.',
  },
  {
    id: 'helpline',
    name: 'Cyber crime helpline 1930',
    url: 'tel:1930',
    when: 'Call right away if money has already left your account.',
  },
  {
    id: 'chakshu',
    name: 'Chakshu on Sanchar Saathi (DoT)',
    url: 'https://sancharsaathi.gov.in/sfc/',
    when: 'Report the fraud call, SMS or WhatsApp message itself.',
  },
  {
    id: 'rbi',
    name: 'RBI Complaint Management System',
    url: 'https://cms.rbi.org.in/',
    when: 'Complain about how your bank or payment app handled it.',
  },
] as const;
