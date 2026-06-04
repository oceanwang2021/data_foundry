import Link from "next/link";

type Props = {
  href: string;
};

export default function RequirementNotSubmittedAlert({ href }: Props) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
      <div className="font-semibold">需求尚未提交</div>
      <div>
        提交需求后才能进入任务环节并生成任务组。请先回到需求页面完成录入并点击“提交”。
      </div>
      <div>
        <Link
          href={href}
          className="text-amber-900 underline underline-offset-4 hover:opacity-80"
        >
          去提交需求
        </Link>
      </div>
    </section>
  );
}
