import { Select } from "@/components/ui/field";

export const TIMEZONES = [
  "America/St_Johns",
  "America/Halifax",
  "America/Toronto",
  "America/Winnipeg",
  "America/Edmonton",
  "America/Vancouver",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

export function TimezoneSelect({
  id,
  defaultValue = "America/Toronto",
}: {
  id: string;
  defaultValue?: string;
}) {
  const options = TIMEZONES.includes(defaultValue) ? TIMEZONES : [defaultValue, ...TIMEZONES];
  return (
    <Select id={id} name="timezone" defaultValue={defaultValue}>
      {options.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace("_", " ")}
        </option>
      ))}
    </Select>
  );
}
