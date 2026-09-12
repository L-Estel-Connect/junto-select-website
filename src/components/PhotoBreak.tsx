import Photo from "./Photo";

export default function PhotoBreak({ label }: { label: string }) {
  return (
    <div className="w-full">
      <Photo ratio="aspect-[16/10] sm:aspect-[21/9]" label={label} />
    </div>
  );
}
