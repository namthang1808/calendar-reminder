import { EventForm } from "@/components/event-form";

export default function NewEventPage() {
  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">New event</h1>
      <EventForm />
    </div>
  );
}
