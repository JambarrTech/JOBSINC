export type IconName = 'arrow' | 'briefcase' | 'chart' | 'check' | 'grid' | 'kanban' | 'lock' | 'mail' | 'pin' | 'search' | 'spark' | 'users' | 'target';

const paths: Record<IconName, string> = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  briefcase: 'M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 4h12m-13 8h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z',
  chart: 'M4 19V5m0 14h16M8 16v-5m4 5V7m4 9v-8',
  check: 'm5 12 4 4L19 6',
  grid: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
  kanban: 'M4 5h4v14H4V5Zm6 0h4v9h-4V5Zm6 0h4v11h-4V5Z',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2m-12 0h14v10H5V10Z',
  mail: 'M4 6h16v12H4V6Zm0 1 8 6 8-6',
  pin: 'M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  search: 'm21 21-4.3-4.3m2.3-5.2a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  spark: 'm12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Zm6 13 .6 2.4L21 19l-2.4.6L18 22l-.6-2.4L15 19l2.4-.6L18 16Z',
  users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m6-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7a3 3 0 0 1 0 6m4 7v-1a4 4 0 0 0-3-3.9',
  target: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-4 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-4-9v3m0 12v3m9-9h-3M7 12H4',
};

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
