import UserFeedbackCard from "./_components/UserFeedbackCard";

export default function Page() {
  //to fetch existing feedback from backend
  const data = "";

  return (
    <main className="w-full bg-secondary-background text-primary">
      {data && <UserFeedbackCard data={data} />}
    </main>
  );
}
