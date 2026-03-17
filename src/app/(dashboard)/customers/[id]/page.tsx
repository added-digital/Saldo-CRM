"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { use } from "react"
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  ChevronDown,
  User,
  UserPlus,
  Pencil,
  Trash2,
  Linkedin,
} from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type {
  Customer,
  CustomerContact,
  CustomerContactLink,
  Profile,
} from "@/types/database"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils"

type ContactWithLink = CustomerContact & {
  relationship_label: string | null
  link_id: string
}

const EMPTY_FORM = {
  name: "",
  role: "",
  email: "",
  phone: "",
  linkedin: "",
  notes: "",
  relationship_label: "",
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [accountManager, setAccountManager] = React.useState<Profile | null>(
    null,
  )
  const [contacts, setContacts] = React.useState<ContactWithLink[]>([])
  const [loading, setLoading] = React.useState(true)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingContact, setEditingContact] =
    React.useState<ContactWithLink | null>(null)
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [deletingContact, setDeletingContact] =
    React.useState<ContactWithLink | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  async function fetchData() {
    const supabase = createClient()

    const { data: customerData } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single()

    const c = customerData as unknown as Customer | null
    setCustomer(c)

    if (c?.fortnox_cost_center) {
      const { data: managerData } = await supabase
        .from("profiles")
        .select("*")
        .eq("fortnox_cost_center", c.fortnox_cost_center)
        .eq("is_active", true)
        .single()

      setAccountManager(managerData as unknown as Profile | null)
    }

    const { data: linkRows } = await supabase
      .from("customer_contact_links")
      .select("id, contact_id, relationship_label, contact:customer_contacts(*)")
      .eq("customer_id", id)

    const rawLinks = (linkRows ?? []) as unknown as {
      id: string
      contact_id: string
      relationship_label: string | null
      contact: CustomerContact
    }[]

    setContacts(
      rawLinks.map((link) => ({
        ...link.contact,
        relationship_label: link.relationship_label,
        link_id: link.id,
      })),
    )

    setLoading(false)
  }

  React.useEffect(() => {
    fetchData()
  }, [id])

  function openAddDialog() {
    setEditingContact(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEditDialog(contact: ContactWithLink) {
    setEditingContact(contact)
    setForm({
      name: contact.name,
      role: contact.role ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      linkedin: contact.linkedin ?? "",
      notes: contact.notes ?? "",
      relationship_label: contact.relationship_label ?? "",
    })
    setDialogOpen(true)
  }

  function openDeleteDialog(contact: ContactWithLink) {
    setDeletingContact(contact)
    setDeleteDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const supabase = createClient()

    const contactPayload = {
      name: form.name.trim(),
      role: form.role.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      linkedin: form.linkedin.trim() || null,
      notes: form.notes.trim() || null,
    }

    if (editingContact) {
      const { error: updateError } = await supabase
        .from("customer_contacts")
        .update(contactPayload as never)
        .eq("id", editingContact.id)

      if (updateError) {
        toast.error("Failed to update contact")
        setSaving(false)
        return
      }

      const { error: linkError } = await supabase
        .from("customer_contact_links")
        .update({
          relationship_label: form.relationship_label.trim() || null,
        } as never)
        .eq("id", editingContact.link_id)

      if (linkError) {
        toast.error("Failed to update relationship")
        setSaving(false)
        return
      }

      toast.success("Contact updated")
    } else {
      const { data: newContact, error: insertError } = await supabase
        .from("customer_contacts")
        .insert(contactPayload as never)
        .select("id")
        .single()

      if (insertError || !newContact) {
        toast.error("Failed to create contact")
        setSaving(false)
        return
      }

      const inserted = newContact as unknown as { id: string }

      const { error: linkError } = await supabase
        .from("customer_contact_links")
        .insert({
          customer_id: id,
          contact_id: inserted.id,
          relationship_label: form.relationship_label.trim() || null,
        } as never)

      if (linkError) {
        toast.error("Failed to link contact")
        setSaving(false)
        return
      }

      toast.success("Contact added")
    }

    setSaving(false)
    setDialogOpen(false)
    fetchData()
  }

  async function handleDelete() {
    if (!deletingContact) return
    setDeleting(true)
    const supabase = createClient()

    const { error: unlinkError } = await supabase
      .from("customer_contact_links")
      .delete()
      .eq("id", deletingContact.link_id)

    if (unlinkError) {
      toast.error("Failed to remove contact")
      setDeleting(false)
      return
    }

    const { count } = await supabase
      .from("customer_contact_links")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", deletingContact.id)

    if (count === 0) {
      await supabase
        .from("customer_contacts")
        .delete()
        .eq("id", deletingContact.id)
    }

    toast.success("Contact removed")
    setDeleting(false)
    setDeleteDialogOpen(false)
    fetchData()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg border bg-muted" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Customer not found" />
        <Button variant="outline" onClick={() => router.push("/customers")}>
          <ArrowLeft className="size-4" />
          Back to customers
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/customers")}
        >
          <ArrowLeft className="size-4" />
          <span className="sr-only">Back</span>
        </Button>
        <PageHeader title={customer.name}>
          <StatusBadge status={customer.status} />
        </PageHeader>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customer.contact_name && (
              <div className="flex items-center gap-3">
                <User className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Primary Contact
                  </p>
                  <p className="text-sm">{customer.contact_name}</p>
                </div>
              </div>
            )}
            {customer.org_number && (
              <div className="flex items-center gap-3">
                <Building2 className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Org Number</p>
                  <p className="text-sm">{customer.org_number}</p>
                </div>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-3">
                <Mail className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{customer.email}</p>
                </div>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-3">
                <Phone className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{customer.phone}</p>
                </div>
              </div>
            )}
            {(customer.address_line1 || customer.city) && (
              <div className="flex items-center gap-3">
                <MapPin className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="text-sm">
                    {[
                      customer.address_line1,
                      customer.address_line2,
                      [customer.zip_code, customer.city]
                        .filter(Boolean)
                        .join(" "),
                      customer.country !== "SE" ? customer.country : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {accountManager ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Account Manager</p>
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <UserAvatar
                    name={accountManager.full_name}
                    avatarUrl={accountManager.avatar_url}
                    size="sm"
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {accountManager.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {accountManager.email}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Account Manager</p>
                <p className="text-sm text-muted-foreground">Unassigned</p>
              </div>
            )}

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fortnox #</span>
                <span>{customer.fortnox_customer_number ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Synced</span>
                <span>
                  {customer.last_synced_at
                    ? formatDate(customer.last_synced_at)
                    : "Never"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(customer.created_at)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Contacts</CardTitle>
            <Button variant="outline" size="sm" onClick={openAddDialog}>
              <UserPlus className="size-4" />
              Add Contact
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No contacts added yet.
            </p>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <div
                  key={contact.link_id}
                  className="flex items-start justify-between rounded-md border p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                      <User className="size-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{contact.name}</p>
                      {(contact.role || contact.relationship_label) && (
                        <p className="text-xs text-muted-foreground">
                          {[contact.role, contact.relationship_label]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Mail className="size-3" />
                            {contact.email}
                          </a>
                        )}
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Phone className="size-3" />
                            {contact.phone}
                          </a>
                        )}
                        {contact.linkedin && (
                          <a
                            href={contact.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Linkedin className="size-3" />
                            LinkedIn
                          </a>
                        )}
                      </div>
                      {contact.notes && (
                        <p className="pt-1 text-xs text-muted-foreground">
                          {contact.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => openEditDialog(contact)}
                    >
                      <Pencil className="size-3.5" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(contact)}
                    >
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {customer.fortnox_raw && (
        <Collapsible>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer">
                <CardTitle className="flex items-center justify-between text-base">
                  Fortnox Raw Data
                  <ChevronDown className="size-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
                  {JSON.stringify(customer.fortnox_raw, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingContact ? "Edit Contact" : "Add Contact"}
            </DialogTitle>
            <DialogDescription>
              {editingContact
                ? "Update the contact details."
                : "Add a new contact person for this customer."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-name">Name</Label>
                <Input
                  id="contact-name"
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-role">Role</Label>
                <Input
                  id="contact-role"
                  placeholder="e.g. CEO, CFO"
                  value={form.role}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, role: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  placeholder="+46 70 123 45 67"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-linkedin">LinkedIn</Label>
                <Input
                  id="contact-linkedin"
                  placeholder="https://linkedin.com/in/..."
                  value={form.linkedin}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, linkedin: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-relationship">Relationship</Label>
                <Input
                  id="contact-relationship"
                  placeholder="e.g. Decision Maker, Technical"
                  value={form.relationship_label}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      relationship_label: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Input
                id="contact-notes"
                placeholder="Additional notes..."
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
              >
                {saving
                  ? "Saving..."
                  : editingContact
                    ? "Update Contact"
                    : "Add Contact"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium text-foreground">
                {deletingContact?.name}
              </span>{" "}
              from this customer? If this contact is not linked to any other
              customers, they will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Removing..." : "Remove Contact"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
