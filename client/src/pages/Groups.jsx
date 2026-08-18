import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle, useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { Loader2, Pencil, Plus, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

type GroupStatus = "active" | "completed" | "paused";
type GroupForm = {
  name: string;
  totalAmount: string;
  durationMonths: string;
  memberCount: string;
  monthlyInstallment: string;
  startDate: string;
  status: GroupStatus;
};

const emptyForm = (): GroupForm => ({
  name: "",
  totalAmount: "",
  durationMonths: "20",
  memberCount: "20",
  monthlyInstallment: "",
  startDate: new Date().toISOString().slice(0, 10),
  status: "active",
});

export default function Groups() {
  const { t } = useLanguage();
  const groups = trpc.groups.list.useQuery();
  const auth = trpc.auth.me.useQuery();
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = () => void groups.refetch();
  const createGroup = trpc.groups.create.useMutation({
    onSuccess: () => {
      toast.success(t("Chit group created", "சீட்டு குழு உருவாக்கப்பட்டது"));
      setForm(emptyForm());
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateGroup = trpc.groups.update.useMutation({
    onSuccess: () => {
      toast.success(t("Group updated", "குழு புதுப்பிக்கப்பட்டது"));
      setEditingId(null);
      setForm(emptyForm());
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateStatus = trpc.groups.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(t("Status updated", "நிலை புதுப்பிக்கப்பட்டது"));
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  if (auth.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#fff3f8]">
        <Loader2 className="animate-spin text-[#c83d73]" />
      </div>
    );
  }
  if (!auth.data || auth.data.role !== "admin") {
    return (
      <div className="min-h-screen grid place-items-center bg-[#fff3f8] p-6 text-[#6b2142]">
        {t("Admin access required.", "நிர்வாகி அணுகல் தேவை.")}
      </div>
    );
  }

  const startEdit = (group: any) => {
    setEditingId(group._id);
    setForm({
      name: group.name,
      totalAmount: String(group.totalAmount),
      durationMonths: String(group.durationMonths),
      memberCount: String(group.memberCount),
      monthlyInstallment: String(group.monthlyInstallment),
      startDate: String(group.startDate).slice(0, 10),
      status: group.status,
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const data = {
      name: form.name,
      totalAmount: Number(form.totalAmount),
      durationMonths: Number(form.durationMonths),
      memberCount: Number(form.memberCount),
      monthlyInstallment: Number(form.monthlyInstallment),
      startDate: form.startDate,
      status: form.status,
    };
    if (editingId) {
      updateGroup.mutate({ id: editingId, data });
    } else {
      createGroup.mutate(data);
    }
  };

  const fields: Array<[keyof GroupForm, string, string]> = [
    ["name", t("Group name", "குழு பெயர்"), "text"],
    ["totalAmount", t("Total amount", "மொத்த தொகை"), "number"],
    ["monthlyInstallment", t("Monthly installment", "மாத தவணை"), "number"],
    ["durationMonths", t("Duration (months)", "கால அளவு (மாதங்கள்)"), "number"],
    ["memberCount", t("Member count", "உறுப்பினர் எண்ணிக்கை"), "number"],
    ["startDate", t("Start date", "தொடக்க தேதி"), "date"],
  ];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#fff3f8] -m-4 p-5 md:p-8 text-[#6b2142]">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-[#c83d73] font-semibold">
                Cheetu / Groups · சீட்டு / குழுக்கள்
              </div>
              <h1 className="font-serif text-4xl mt-3">{t("Chit groups", "சீட்டு குழுக்கள்")}</h1>
              <p className="text-[#8b6474] mt-2">
                {t("Create, edit, pause, and complete every chit group from one place.", "ஒவ்வொரு சீட்டு குழுவையும் இங்கே உருவாக்கி, திருத்தி, நிறுத்தி, முடிக்கவும்.")}
              </p>
            </div>
            <LanguageToggle />
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
            <Card className="h-fit border-[#f1c3d5] bg-white">
              <CardHeader>
                <CardTitle className="font-serif text-2xl flex items-center gap-2">
                  {editingId ? <Pencil className="h-5 w-5 text-[#c83d73]" /> : <Plus className="h-5 w-5 text-[#c83d73]" />}
                  {editingId ? t("Edit group", "குழுவைத் திருத்து") : t("Create a group", "குழுவை உருவாக்கு")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="space-y-4">
                  {fields.map(([key, label, type]) => (
                    <div key={key}>
                      <Label>{label}</Label>
                      <Input
                        required
                        min={type === "number" ? "1" : undefined}
                        type={type}
                        value={form[key]}
                        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                        className="mt-1.5 bg-white"
                      />
                    </div>
                  ))}
                  <div>
                    <Label>{t("Status", "நிலை")}</Label>
                    <select
                      value={form.status}
                      onChange={(event) => setForm({ ...form, status: event.target.value as GroupStatus })}
                      className="mt-1.5 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                    >
                      <option value="active">{t("Active", "செயலில்")}</option>
                      <option value="paused">{t("Paused", "இடைநிறுத்தப்பட்டது")}</option>
                      <option value="completed">{t("Completed", "முடிந்தது")}</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={createGroup.isPending || updateGroup.isPending} className="flex-1 bg-[#6b2142] hover:bg-[#8d2e59]">
                      <Save className="mr-2 h-4 w-4" />
                      {editingId ? t("Save changes", "மாற்றங்களைச் சேமி") : t("Create group", "குழுவை உருவாக்கு")}
                    </Button>
                    {editingId && (
                      <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>
                        <X className="mr-2 h-4 w-4" />
                        {t("Cancel", "ரத்து")}
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border-[#f1c3d5] bg-white">
              <CardHeader>
                <CardTitle className="font-serif text-2xl">{t("All groups", "அனைத்து குழுக்கள்")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {groups.isLoading && <Loader2 className="mx-auto animate-spin text-[#c83d73]" />}
                {!groups.isLoading && !groups.data?.length && (
                  <p className="py-10 text-center text-sm text-[#8b6474]">{t("No chit groups yet.", "இன்னும் சீட்டு குழுக்கள் இல்லை.")}</p>
                )}
                {(groups.data || []).map((group: any) => (
                  <div key={group._id} className="rounded-2xl border border-[#f1c3d5] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-medium text-lg">{group.name}</div>
                        <div className="mt-1 text-sm text-[#8b6474]">
                          {group.memberCount} {t("members", "உறுப்பினர்கள்")} · {group.durationMonths} {t("months", "மாதங்கள்")} · {money.format(group.monthlyInstallment)} / {t("month", "மாதம்")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={group.status === "active" ? "bg-[#f9d7e4] text-[#8b315a]" : "bg-[#ffe1ec] text-[#a83d65]"}>{group.status}</Badge>
                        <Button size="sm" variant="outline" onClick={() => startEdit(group)} className="border-[#e4a8bd]">
                          <Pencil className="mr-1 h-3.5 w-3.5" />{t("Edit", "திருத்து")}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">{money.format(group.totalAmount)}</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: group._id, status: group.status === "active" ? "paused" : "active" })} className="border-[#e4a8bd]">
                          {group.status === "active" ? t("Pause", "நிறுத்து") : t("Activate", "செயல்படுத்து")}
                        </Button>
                        {group.status !== "completed" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: group._id, status: "completed" })} className="border-[#e4a8bd]">
                            {t("Mark completed", "முடிந்ததாக குறி")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
