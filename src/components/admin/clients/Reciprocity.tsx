/**
 * Reciprocal compatibility, both directions spelled out: does the
 * candidate fit what the client asked for, and does the client fit what
 * the candidate asked for (the same hard filters, run both ways).
 */
export default function Reciprocity({
  clientName,
  candidateName,
  clientAccepts,
  candidateAccepts,
}: {
  clientName: string;
  candidateName: string;
  clientAccepts: boolean;
  candidateAccepts: boolean;
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
      <li className={clientAccepts ? "text-[#3a5a37]" : "text-[#8a3b3b]"}>
        {clientAccepts ? "✓" : "✗"} {candidateName} encaja con lo que pide {clientName}
      </li>
      <li className={candidateAccepts ? "text-[#3a5a37]" : "text-[#8a3b3b]"}>
        {candidateAccepts ? "✓" : "✗"} {clientName} encaja con lo que pide {candidateName}
      </li>
    </ul>
  );
}
