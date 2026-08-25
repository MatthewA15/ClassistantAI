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
      <div className="inline-flex items-center gap-3 rounded-full bg-white py-2 pl-2.5 pr-4 shadow-soft ring-1 ring-line">
        {/* The ring is white rather than transparent, so overlapping circles
            stay separate against each other as well as against the pill. */}
        <span className="flex items-center">
          {PEOPLE.map((person, i) => (
            <Face key={person.name} person={person} first={i === 0} />
          ))}
        </span>

        <span className="text-[0.85rem] font-semibold text-ink-900">
          Who solved this problem?
        </span>

        {/* The pile is decorative to a screen reader, which would otherwise read
            three names with no idea what they are. This says it once. */}
        <span className="sr-only">
          Built by {PEOPLE.map((p) => p.name).join(", ")}.
        </span>
      </div>
    </div>
  );
}

function Face({ person, first }: { person: Person; first: boolean }) {
  const shared = "h-8 w-8 rounded-full ring-2 ring-white";
  const offset = first ? "" : "-ml-2.5";

  if (person.photo) {
    return (
      <Image
        src={person.photo}
        alt={person.name}
        title={person.name}
        width={32}
        height={32}
        className={`${shared} ${offset} object-cover`}
      />
    );
  }

  return (
    <span
      title={person.name}
      aria-hidden="true"
      className={`${shared} ${offset} grid place-items-center text-[0.72rem] font-bold text-white`}
      style={{ background: person.tint }}
    >
      {person.name.slice(0, 1)}
    </span>
  );
}
