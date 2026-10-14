import { cn } from '@/lib/utils';
// The full-bleed icon: public/icon/128.png has the padding Chrome and the Web Store expect.
import mark from '~~/assets/brand/icon.svg';

/** The Accessible Find icon and wordmark. With `heading`, the name is the page's <h1>. */
export function BrandMark(props: { className?: string; subtitle?: string; heading?: boolean }) {
  const { className, subtitle, heading } = props;
  const Name = heading ? 'h1' : 'div';
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img src={mark} alt="" className="size-11 shrink-0 rounded-xl shadow-sm" />
      <Name className="leading-tight">
        <span className="block text-xl font-bold tracking-tight">Accessible Find</span>
        {subtitle && <span className="block text-sm text-muted-foreground">{subtitle}</span>}
      </Name>
    </div>
  );
}
