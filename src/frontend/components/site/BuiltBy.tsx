import Image from "next/image";

/**
 * The three people who built it, as a facepile in a pill.
 *
 * Onboarding is the point in the product where a student is being asked to hand
 * over a school login, and the page is otherwise all mechanism: fields, scopes,
 * a progress bar. Three faces is the cheapest way to say a person is behind it.
 *
 * The photos do not exist yet, and the fallback follows the same rule as the
 * school crests in [09](../../docs/design/09-school-theming.md): rather than
 * shipping a grey silhouette or a stock face, an absent photo renders as a
 * monogram, which claims nothing. Drop a file in `public/team/` and set `photo`
 * and that person's circle becomes the real thing, with nothing else to change.
 */

type Person = {
  name: string;
  /** Path under `public/`, once a real photo exists. */
  photo?: string;
  /**
   * Palette only: dark blue and ink. No purple, ever.
   *
   * All three have to stay dark enough to carry white text, which rules out the
   * sky steps: those are mixes toward white, and under a school theme they go
   * pale enough that the initial disappears. This runs on the onboarding page,
   * which is themed in the student's school colours, so a tint that only works
   * against the default blue is a tint that breaks somewhere.
   */
  tint: string;
};

const PEOPLE: Person[] = [
  { name: "Oba", tint: "var(--color-brand-600)" },
  { name: "Chim", tint: "var(--color-ink-700)" },
  { name: "Matthew", tint: "var(--color-brand-700)" },
];

export function BuiltBy() {
  return (
    <div className="flex justify-center">
      {/* Not a facepile. Overlapping circles are a density trick for "and 47
          others", and there are three of them with names worth reading, so they
          stand apart with the name under each. */}
      <div className="inline-flex flex-wrap items-center justify-center gap-x-9 gap-y-5 rounded-full bg-white px-9 py-6 shadow-soft ring-1 ring-line">
        <span className="max-w-[25rem] text-center sm:text-left">
          <span className="block font-display text-[1.15rem] font-extrabold tracking-[-0.01em] text-ink-900">
            Who solved this problem?
          </span>
          {/* "three" is typed, not counted, unlike the school count in the hero
              which is derived for exactly this reason. It is an idiom rather
              than a tally, so it reads badly as `${PEOPLE.length}`, but it does
              go stale the day a fourth name joins the list above. */}
          <span className="mt-1.5 block text-[0.82rem] leading-[1.5] text-body-soft">
            The three amigos set out to finally put an end to missed deadlines,
            chronic procrastination, and so much more.
          </span>
        </span>

        <span className="flex items-start gap-7">
          {PEOPLE.map((person) => (
            <span key={person.name} className="flex flex-col items-center gap-2">
              <Face person={person} />
              <span className="text-[0.82rem] font-semibold text-body-soft">{person.name}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function Face({ person }: { person: Person }) {
  const shared = "h-16 w-16 rounded-full";

  if (person.photo) {
    return (
      <Image
        src={person.photo}
        alt={person.name}
        width={64}
        height={64}
        className={`${shared} object-cover ring-1 ring-line`}
      />
    );
  }

  return (
    // The name is printed directly underneath, so the circle itself is
    // decoration and repeating the initial to a screen reader is noise.
    <span
      aria-hidden="true"
      className={`${shared} grid place-items-center text-[1.35rem] font-bold text-white`}
      style={{ background: person.tint }}
    >
      {person.name.slice(0, 1)}
    </span>
  );
}
