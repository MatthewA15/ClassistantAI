import { Container } from "@/components/ui/primitives";
import { LIVE_SCHOOLS } from "@/data/schools";

/**
 * Thin marquee of supported schools under the hero.
 *
 * The list is short, so it is duplicated once and translated by exactly -50% to
 * loop seamlessly. The duplicate is hidden from assistive tech and the whole
 * strip stops moving under prefers-reduced-motion, where it just reads as a row.
 */
export function SchoolStrip() {
  const names = LIVE_SCHOOLS.map((s) => s.name);

  return (
    <div className="border-y border-line bg-paper py-6">
      <Container>
        <p className="text-center text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-body-soft">
          Live at
        </p>
      </Container>

      <div className="relative mt-4 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max motion-safe:animate-marquee">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1}
              className="flex shrink-0 items-center gap-10 pr-10"
            >
              {names.map((name) => (
                <li
                  key={name}
                  className="whitespace-nowrap font-display text-[1.05rem] font-bold text-ink-800/60"
                >
                  {name}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
