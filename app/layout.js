import './globals.css';
import Nav from '@/components/Nav';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getSessionUser } from '@/lib/auth';
import DemoAnalytics from '@/components/DemoAnalytics';
import { BRAND } from '@/lib/brand';
import { Architects_Daughter, Fira_Code } from 'next/font/google';
import { queryOne } from '@/lib/db';
import { AssistantWidget } from '@/components/assistant/assistant-widget';
import { getAiName } from '@/lib/assistant';

// Home's type system (app/page.js) for every page: --font-hand for titles and labels,
// --font-figures for dates and money (globals.css .font-hand / .figures).
const hand = Architects_Daughter({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-hand' });
const figures = Fira_Code({ weight: '500', subsets: ['latin'], display: 'swap', variable: '--font-figures' });

export const metadata = {
  title: BRAND.app,
  description: `Operations for ${BRAND.studio} & ${BRAND.workshop}`,
  // Public demo: only /demo (which sets its own robots) should be indexed.
  ...(process.env.DEMO_MODE === '1' ? { robots: { index: false, follow: false } } : {}),
};

// Set the theme before first paint so there's no light→dark flash.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default async function RootLayout({ children }) {
  const session = await getSessionUser();
  // The nav shows the login's avatar; the token doesn't carry it.
  const user = session && {
    ...session,
    ...(await queryOne('SELECT avatar_color, avatar_font, avatar_image_key AS avatar_url FROM users WHERE username = ?', [session.username])),
  };
  return (
    <html lang="en" className={`${hand.variable} ${figures.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body className="min-h-screen bg-background text-foreground">
        <TooltipProvider delayDuration={200}>
          {user && <Nav user={user} />}
          {/* Extra bottom padding on mobile so content clears the fixed bottom tab bar. */}
          <div className={user ? 'pb-20 md:pb-0' : ''}>{children}</div>
          {user && <AssistantWidget user={{ username: user.username, display_name: user.display_name }} aiName={await getAiName()} />}
          {process.env.DEMO_MODE === '1' && user && (
            <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur md:bottom-4 print:hidden">
              Demo · sample data, resets nightly ·{' '}
              <a href="/demo" className="font-medium text-foreground underline-offset-2 hover:underline">Switch login</a>
            </div>
          )}
        </TooltipProvider>
        <Toaster position="top-center" richColors />
        {process.env.DEMO_MODE === '1' && <DemoAnalytics />}
      </body>
    </html>
  );
}
