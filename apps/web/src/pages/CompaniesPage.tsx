import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { CreateCompanyInput } from '@job-harvester/shared';
import { createCompany, fetchCompanies } from '@/api/companies';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CompaniesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateCompanyInput>({
    canonicalName: '',
    industry: '',
    website: '',
    note: '',
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      setForm({ canonicalName: '', industry: '', website: '', note: '' });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: CreateCompanyInput = {
      canonicalName: form.canonicalName.trim(),
      industry: form.industry?.trim() || undefined,
      website: form.website?.trim() || undefined,
      note: form.note?.trim() || undefined,
    };
    createMutation.mutate(payload);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">公司管理</h1>
        <p className="mt-2 text-muted-foreground">
          job_harvester 骨架验证 —— 端到端公司增查
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>新增公司</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="canonicalName">公司名称 *</Label>
              <Input
                id="canonicalName"
                required
                value={form.canonicalName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    canonicalName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="industry">行业</Label>
              <Input
                id="industry"
                value={form.industry ?? ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    industry: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="website">官网</Label>
              <Input
                id="website"
                value={form.website ?? ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    website: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="note">备注</Label>
              <Input
                id="note"
                value={form.note ?? ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? '保存中…' : '保存'}
            </Button>
            {createMutation.isError ? (
              <p className="text-sm text-destructive">保存失败，请重试</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>公司列表</CardTitle>
        </CardHeader>
        <CardContent>
          {companiesQuery.isLoading ? (
            <p className="text-muted-foreground">加载中…</p>
          ) : companiesQuery.isError ? (
            <p className="text-destructive">加载失败</p>
          ) : (companiesQuery.data?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">暂无公司，请先新增</p>
          ) : (
            <ul className="divide-y">
              {(companiesQuery.data ?? []).map((company) => (
                <li key={company.id} className="py-3">
                  <div className="font-medium">{company.canonicalName}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {[company.industry, company.website, company.note]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
