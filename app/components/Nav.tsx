import Container from '@/app/components/Container';
import Logo from '@/app/components/Logo';
import NotificationFeed from '@/app/components/NotificationFeed';
import LogoutButton from '@/app/components/LogoutButton';

interface NavProps {
  userId: number;
  userName: string;
  userRole?: 'driver' | 'manager';
  subtitle?: string;
}

export default function Nav({
  userId,
  userName,
  userRole,
  subtitle,
}: NavProps) {
  const displaySubtitle =
    subtitle || (userRole === 'manager' ? 'Logistics Manager' : 'Fleet Driver');

  return (
    <nav className="bg-[#1a1f24] text-white py-3 sticky top-0 z-20 shadow-md shrink-0">
      <Container className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Logo className="w-8 h-8 rounded-sm" />
          <div>
            <span className="font-bold tracking-wide text-sm block leading-tight">
              Hello, {userName}
            </span>
            {displaySubtitle && (
              <span className="text-[10px] text-slate-400 block capitalize">
                {displaySubtitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <NotificationFeed userId={userId} userRole={userRole} />
          <LogoutButton userId={userId} />
        </div>
      </Container>
    </nav>
  );
}