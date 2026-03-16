"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Tags, Plus, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/client";
import type { Segment } from "@/types/database";
import { EmptyState } from "@/components/app/empty-state";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions } from "@/components/app/form-actions";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRESET_COLORS = [
  { label: "Amber", value: "oklch(0.75 0.12 65)" }, // -15° warmer
  { label: "Orange", value: "oklch(0.72 0.14 45)" }, // -35° deeper orange
  { label: "Copper", value: "oklch(0.68 0.13 55)" }, // warm mid-tone
  { label: "Lime", value: "oklch(0.75 0.10 110)" }, // +30° cooler yellow
  { label: "Sage", value: "oklch(0.68 0.09 140)" }, // +60° muted green
  { label: "Teal", value: "oklch(0.65 0.10 190)" }, // +110° complementary
  { label: "Sky", value: "oklch(0.68 0.10 230)" }, // +150° cool blue
  { label: "Lavender", value: "oklch(0.72 0.09 300)" }, // opposite warm
  { label: "Rose", value: "oklch(0.70 0.10 10)" }, // full complement
];

const segmentSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name is too long"),
  description: z.string().max(200, "Description is too long").optional(),
  color: z.string().min(1, "Color is required"),
});

type SegmentInput = z.infer<typeof segmentSchema>;

export default function SegmentsPage() {
  const router = useRouter();
  const { isAdmin } = useUser();
  const [segments, setSegments] = React.useState<Segment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Segment | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Segment | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const createForm = useForm<SegmentInput>({
    resolver: zodResolver(segmentSchema),
    defaultValues: { name: "", description: "", color: "#3b82f6" },
  });

  const editForm = useForm<SegmentInput>({
    resolver: zodResolver(segmentSchema),
    defaultValues: { name: "", description: "", color: "#3b82f6" },
  });

  async function fetchSegments() {
    const supabase = createClient();
    const { data } = await supabase.from("segments").select("*").order("name");

    setSegments((data ?? []) as unknown as Segment[]);
    setLoading(false);
  }

  React.useEffect(() => {
    fetchSegments();
  }, []);

  React.useEffect(() => {
    if (editTarget) {
      editForm.reset({
        name: editTarget.name,
        description: editTarget.description ?? "",
        color: editTarget.color,
      });
    }
  }, [editTarget, editForm]);

  async function onCreateSubmit(values: SegmentInput) {
    const supabase = createClient();
    const { error } = await supabase.from("segments").insert({
      name: values.name,
      description: values.description || null,
      color: values.color,
    } as never);

    if (error) {
      if (error.code === "23505") {
        toast.error("A segment with this name already exists");
      } else {
        toast.error("Failed to create segment");
      }
      return;
    }

    toast.success("Segment created");
    setCreateOpen(false);
    createForm.reset();
    fetchSegments();
  }

  async function onEditSubmit(values: SegmentInput) {
    if (!editTarget) return;
    const supabase = createClient();

    const { error } = await supabase
      .from("segments")
      .update({
        name: values.name,
        description: values.description || null,
        color: values.color,
      } as never)
      .eq("id", editTarget.id);

    if (error) {
      if (error.code === "23505") {
        toast.error("A segment with this name already exists");
      } else {
        toast.error("Failed to update segment");
      }
      return;
    }

    toast.success("Segment updated");
    setEditTarget(null);
    fetchSegments();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("segments")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      toast.error("Failed to delete segment");
    } else {
      toast.success("Segment deleted");
      setDeleteTarget(null);
      fetchSegments();
    }
    setDeleteLoading(false);
  }

  if (loading || !isAdmin) {
    return (
      <div className="space-y-6">
        <div className="h-48 animate-pulse rounded-lg border bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              New Segment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Segment</DialogTitle>
              <DialogDescription>
                Add a new segment to categorize your customers.
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit(onCreateSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Restaurant" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Restaurant and food service businesses"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <FormControl>
                        <ColorPicker
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormActions
                  submitLabel="Create Segment"
                  loading={createForm.formState.isSubmitting}
                  onCancel={() => setCreateOpen(false)}
                />
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {segments.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No segments"
          description="Create your first segment to categorize customers."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Segments ({segments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {segments.map((segment) => (
                <div
                  key={segment.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className="border-transparent"
                      style={{
                        color: segment.color,
                        borderColor: segment.color,
                      }}
                    >
                      {segment.name}
                    </Badge>
                    {segment.description && (
                      <span className="text-sm text-muted-foreground">
                        {segment.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditTarget(segment)}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(segment)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Segment</DialogTitle>
            <DialogDescription>Update the segment details.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <ColorPicker
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormActions
                submitLabel="Save Changes"
                loading={editForm.formState.isSubmitting}
                onCancel={() => setEditTarget(null)}
              />
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete segment"
        description={`Permanently delete "${deleteTarget?.name}"? Customers assigned to this segment will be unlinked automatically.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          title={preset.label}
          onClick={() => onChange(preset.value)}
          className={cn(
            "size-8 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            value === preset.value
              ? "border-foreground scale-110"
              : "border-transparent",
          )}
          style={{ backgroundColor: preset.value }}
        />
      ))}
    </div>
  );
}
