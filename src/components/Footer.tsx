import Section from "./Section";
import Wordmark from "./Wordmark";

export default function Footer() {
  return (
    <Section as="footer" className="border-t border-hairline py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Wordmark className="text-base text-ink-soft" />
        <p className="text-xs text-ink-soft">
          Madrid · © {new Date().getFullYear()} Junto Select
        </p>
      </div>
    </Section>
  );
}
