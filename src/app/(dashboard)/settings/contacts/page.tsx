"use client"

import * as React from "react"
import Link from "next/link"
import { Copy, Mail, Pencil, Phone, Search, User, Users, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type { Customer, CustomerContact } from "@/types/database"
import {
  EditContactDialog,
  type ContactFields,
} from "@/components/app/edit-contact-dialog"
import { EmptyState } from "@/components/app/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useUser } from "@/hooks/use-user"

type CustomerOptionWithStatus = Pick<
  Customer,
  "id" | "name" | "fortnox_customer_number" | "status"
>

type ContactWithCustomers = CustomerContact & {
  primaryCustomers: CustomerOptionWithStatus[]
  customers: CustomerOptionWithStatus[]
}

export default function ContactsPage() {
  const { isAdmin } = useUser()
  const [contacts, setContacts] = React.useState<ContactWithCustomers[]>([])
  const [allCustomers, setAllCustomers] = React.useState<CustomerOptionWithStatus[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [showDuplicates, setShowDuplicates] = React.useState(false)
  const [showArchivedCustomerContacts, setShowArchivedCustomerContacts] = React.useState(false)
  const [showMissingMail, setShowMissingMail] = React.useState(false)
  const [showMissingPhone, setShowMissingPhone] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingContact, setEditingContact] = React.useState<ContactWithCustomers | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [deletingContact, setDeletingContact] = React.useState<ContactWithCustomers | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const fetchContacts = React.useCallback(async () => {
    setLoading(true)

    const response = await fetch("/api/contacts", { cache: "no-store" })
    const payload = (await response.json().catch(() => null)) as {
      contacts?: ContactWithCustomers[]
      customers?: CustomerOptionWithStatus[]
      error?: string
    } | null

    if (!response.ok) {
      toast.error(payload?.error ?? "Failed to load contacts")
      setContacts([])
      setAllCustomers([])
      setLoading(false)
      return
    }

    setContacts(payload?.contacts ?? [])
    setAllCustomers(payload?.customers ?? [])
    setLoading(false)
  }, [])

  React.useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  const getVisibleRelatedCustomers = React.useCallback(
    (relatedCustomers: CustomerOptionWithStatus[]) => {
      if (showArchivedCustomerContacts) return relatedCustomers
      return relatedCustomers.filter((customer) => customer.status !== "archived")
    },
    [showArchivedCustomerContacts],
  )

  const getVisibleRelations = React.useCallback(
    (contact: ContactWithCustomers) => {
      const primary = getVisibleRelatedCustomers(contact.primaryCustomers)
      const regular = getVisibleRelatedCustomers(contact.customers)
      return { primary, regular }
    },
    [getVisibleRelatedCustomers],
  )

  const contactsByArchivedToggle = React.useMemo(() => {
    if (showArchivedCustomerContacts) return contacts

    return contacts.filter((contact) => {
      const totalRelations = contact.primaryCustomers.length + contact.customers.length
      if (totalRelations === 0) return true

      const visibleRelations =
        getVisibleRelatedCustomers(contact.primaryCustomers).length +
        getVisibleRelatedCustomers(contact.customers).length

      return visibleRelations > 0
    })
  }, [contacts, showArchivedCustomerContacts, getVisibleRelatedCustomers])

  const duplicateEmails = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const contact of contactsByArchivedToggle) {
      const email = contact.email?.trim().toLowerCase()
      if (!email) continue
      counts.set(email, (counts.get(email) ?? 0) + 1)
    }
    const dupes = new Set<string>()
    for (const [email, count] of counts) {
      if (count > 1) dupes.add(email)
    }
    return dupes
  }, [contactsByArchivedToggle])

  const duplicateCount = React.useMemo(() => {
    return contactsByArchivedToggle.filter((c) => {
      const email = c.email?.trim().toLowerCase()
      return email && duplicateEmails.has(email)
    }).length
  }, [contactsByArchivedToggle, duplicateEmails])

  const filteredContacts = React.useMemo(() => {
    let result = contactsByArchivedToggle

    if (showDuplicates) {
      result = result.filter((contact) => {
        const email = contact.email?.trim().toLowerCase()
        return email && duplicateEmails.has(email)
      })
    }

    if (showMissingMail) {
      result = result.filter((contact) => !contact.email?.trim())
    }

    if (showMissingPhone) {
      result = result.filter((contact) => !contact.phone?.trim())
    }

    if (!search) return result
    const query = search.toLowerCase()
    return result.filter((contact) => {
      const allCustomerNames = [
        ...getVisibleRelatedCustomers(contact.primaryCustomers),
        ...getVisibleRelatedCustomers(contact.customers),
      ]
        .map((customer) => customer.name.toLowerCase())
        .join(" ")
      return [contact.name, contact.email ?? "", contact.role ?? "", allCustomerNames]
        .join(" ")
        .toLowerCase()
        .includes(query)
    })
  }, [
    contactsByArchivedToggle,
    search,
    showDuplicates,
    showMissingMail,
    showMissingPhone,
    duplicateEmails,
    getVisibleRelatedCustomers,
  ])

  const existingPrimaryByCustomerId = React.useMemo(() => {
    const map: Record<
      string,
      { customerName: string; contactId: string; contactName: string }
    > = {}

    for (const contact of contacts) {
      for (const customer of contact.primaryCustomers) {
        if (!map[customer.id]) {
          map[customer.id] = {
            customerName: customer.name,
            contactId: contact.id,
            contactName: contact.name,
          }
        }
      }
    }

    return map
  }, [contacts])

  function openEditDialog(contact: ContactWithCustomers) {
    setEditingContact(contact)
    setDialogOpen(true)
  }

  function openDeleteDialog(contact: ContactWithCustomers) {
    setDeletingContact(contact)
    setDeleteDialogOpen(true)
  }

  async function syncPrimaryFields(customerIds: string[]) {
    const uniqueCustomerIds = Array.from(new Set(customerIds))
    if (uniqueCustomerIds.length === 0) return

    const response = await fetch("/api/contacts/primary-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customerIds: uniqueCustomerIds }),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      toast.error(payload?.error ?? "Failed to sync primary contact fields to Fortnox")
    }
  }

  async function handleSaveContact(
    payload: ContactFields & {
      primaryCustomerIds: string[]
      customerIds: string[]
    },
  ) {
    if (!editingContact) return
    const supabase = createClient()
    const uniquePrimaryIds = Array.from(new Set(payload.primaryCustomerIds))
    const uniqueRegularIds = Array.from(
      new Set(payload.customerIds.filter((customerId) => !uniquePrimaryIds.includes(customerId))),
    )

    const { error: updateError } = await supabase
      .from("customer_contacts")
      .update({
        name: payload.name,
        first_name: payload.firstName,
        last_name: payload.lastName,
        role: payload.role,
        email: payload.email,
        phone: payload.phone,
        linkedin: payload.linkedin,
        notes: payload.notes,
      } as never)
      .eq("id", editingContact.id)

    if (updateError) {
      toast.error("Failed to update contact")
      throw updateError
    }

    const existingPrimaryIds = new Set(
      editingContact.primaryCustomers.map((customer) => customer.id),
    )
    const existingRegularIds = new Set(
      editingContact.customers.map((customer) => customer.id),
    )
    const allExistingIds = new Set([...existingPrimaryIds, ...existingRegularIds])

    const newPrimarySet = new Set(uniquePrimaryIds)
    const newRegularSet = new Set(uniqueRegularIds)
    const removedPrimaryIds = [...existingPrimaryIds].filter(
      (customerId) => !newPrimarySet.has(customerId),
    )
    const allNewIds = new Set([...newPrimarySet, ...newRegularSet])

    let conflictingLinkIds: string[] = []
    let conflictingContactIds: string[] = []

    if (uniquePrimaryIds.length > 0) {
      const { data: conflictingRows, error: conflictingError } = await supabase
        .from("customer_contact_links")
        .select("id, contact_id")
        .in("customer_id", uniquePrimaryIds)
        .eq("is_primary", true)
        .neq("contact_id", editingContact.id)

      if (conflictingError) {
        toast.error("Failed to validate primary contacts")
        throw conflictingError
      }

      const conflicts = (conflictingRows ?? []) as Array<{ id: string; contact_id: string }>
      conflictingLinkIds = conflicts.map((row) => row.id)
      conflictingContactIds = Array.from(
        new Set(conflicts.map((row) => row.contact_id)),
      )
    }

    const idsToRemove = [...allExistingIds].filter(
      (existingId) => !allNewIds.has(existingId),
    )

    if (idsToRemove.length > 0) {
      const { error: removeError } = await supabase
        .from("customer_contact_links")
        .delete()
        .eq("contact_id", editingContact.id)
        .in("customer_id", idsToRemove)

      if (removeError) {
        toast.error("Failed to remove customer relations")
        throw removeError
      }
    }

    const primaryToInsert = uniquePrimaryIds.filter(
      (cid) => !allExistingIds.has(cid),
    )
    const regularToInsert = uniqueRegularIds.filter(
      (cid) => !allExistingIds.has(cid),
    )

    const insertRows = [
      ...primaryToInsert.map((customerId) => ({
        customer_id: customerId,
        contact_id: editingContact.id,
        is_primary: true,
        relationship_label: null,
      })),
      ...regularToInsert.map((customerId) => ({
        customer_id: customerId,
        contact_id: editingContact.id,
        is_primary: false,
        relationship_label: null,
      })),
    ]

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase
        .from("customer_contact_links")
        .insert(insertRows as never)

      if (insertError) {
        toast.error("Failed to add customer relations")
        throw insertError
      }
    }

    const upgradeToPrimary = uniquePrimaryIds.filter(
      (cid) => existingRegularIds.has(cid),
    )
    const downgradeToRegular = uniqueRegularIds.filter(
      (cid) => existingPrimaryIds.has(cid),
    )

    for (const customerId of upgradeToPrimary) {
      const { error } = await supabase
        .from("customer_contact_links")
        .update({ is_primary: true } as never)
        .eq("contact_id", editingContact.id)
        .eq("customer_id", customerId)

      if (error) {
        toast.error("Failed to update primary status")
        throw error
      }
    }

    for (const customerId of downgradeToRegular) {
      const { error } = await supabase
        .from("customer_contact_links")
        .update({ is_primary: false } as never)
        .eq("contact_id", editingContact.id)
        .eq("customer_id", customerId)

      if (error) {
        toast.error("Failed to update primary status")
        throw error
      }
    }

    if (conflictingLinkIds.length > 0) {
      const { error: removeConflictingError } = await supabase
        .from("customer_contact_links")
        .delete()
        .in("id", conflictingLinkIds)

      if (removeConflictingError) {
        toast.error("Failed to replace existing primary contacts")
        throw removeConflictingError
      }
    }

    for (const conflictingContactId of conflictingContactIds) {
      const { count, error: countError } = await supabase
        .from("customer_contact_links")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", conflictingContactId)

      if (countError) {
        toast.error("Failed to validate replaced contacts")
        throw countError
      }

      if ((count ?? 0) === 0) {
        const { error: deleteContactError } = await supabase
          .from("customer_contacts")
          .delete()
          .eq("id", conflictingContactId)

        if (deleteContactError) {
          toast.error("Failed to clean up replaced primary contact")
          throw deleteContactError
        }
      }
    }

    await syncPrimaryFields([...uniquePrimaryIds, ...removedPrimaryIds])

    toast.success("Contact updated")
    setEditingContact(null)
    await fetchContacts()
  }

  async function handleDelete() {
    if (!deletingContact) return
    setDeleting(true)
    const supabase = createClient()

    const { error: unlinkError } = await supabase
      .from("customer_contact_links")
      .delete()
      .eq("contact_id", deletingContact.id)

    if (unlinkError) {
      toast.error("Failed to delete contact")
      setDeleting(false)
      return
    }

    const { error: deleteError } = await supabase
      .from("customer_contacts")
      .delete()
      .eq("id", deletingContact.id)

    if (deleteError) {
      toast.error("Failed to delete contact")
      setDeleting(false)
      return
    }

    toast.success("Contact deleted")
    setDeleting(false)
    setDeleteDialogOpen(false)
    setDeletingContact(null)
    await fetchContacts()
  }

  if (!isAdmin) {
    return <div className="h-48 animate-pulse rounded-lg border bg-muted" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts or customers..."
            className="pl-9"
          />
        </div>
        {duplicateCount > 0 && (
          <Button
            variant={showDuplicates ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDuplicates((prev) => !prev)}
          >
            <Copy className="size-4" />
            Duplicates ({duplicateCount})
          </Button>
        )}
        <Button
          variant={showMissingMail ? "default" : "outline"}
          size="sm"
          onClick={() => setShowMissingMail((previous) => !previous)}
        >
          Missing Mail
        </Button>
        <Button
          variant={showMissingPhone ? "default" : "outline"}
          size="sm"
          onClick={() => setShowMissingPhone((previous) => !previous)}
        >
          Missing Phone
        </Button>
        <Button
          variant={showArchivedCustomerContacts ? "default" : "outline"}
          size="sm"
          onClick={() =>
            setShowArchivedCustomerContacts((previous) => !previous)
          }
        >
          Show contacts for archived customers
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filteredContacts.length} of {contactsByArchivedToggle.length} contacts
      </p>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      ) : filteredContacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts"
          description="Contacts linked to customers will appear here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredContacts.map((contact) => {
            const visibleRelations = getVisibleRelations(contact)
            const email = contact.email?.trim() || null
            const phone = contact.phone?.trim() || null
            return (
            <Card key={contact.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-3 text-base">
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <User className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="truncate">{contact.name}</div>
                      {contact.role && (
                        <p className="text-sm font-normal text-muted-foreground">
                          {contact.role}
                        </p>
                      )}
                    </div>
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => openEditDialog(contact)}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">Edit contact</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(contact)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete contact</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  {email ? (
                    <a
                      href={`mailto:${email}`}
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Mail className="size-4" />
                      <span className="truncate">{email}</span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="size-4" />
                      <span>–</span>
                    </div>
                  )}
                  {phone ? (
                    <a
                      href={`tel:${phone}`}
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Phone className="size-4" />
                      <span>{phone}</span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-4" />
                      <span>–</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Primary contact for
                  </p>
                  {visibleRelations.primary.length === 0 ? (
                    <p className="text-sm text-muted-foreground">–</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {visibleRelations.primary.map((customer) => (
                        <Link key={customer.id} href={`/customers/${customer.id}`}>
                          <Badge variant="outline" className="cursor-pointer font-normal hover:bg-muted">
                            {customer.name}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Contact for
                  </p>
                  {visibleRelations.regular.length === 0 ? (
                    <p className="text-sm text-muted-foreground">–</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {visibleRelations.regular.map((customer) => (
                        <Link key={customer.id} href={`/customers/${customer.id}`}>
                          <Badge variant="outline" className="cursor-pointer font-normal hover:bg-muted">
                            {customer.name}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}

      <EditContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editingContact}
        customers={allCustomers}
        existingPrimaryByCustomerId={existingPrimaryByCustomerId}
        initialPrimaryCustomerIds={
          editingContact?.primaryCustomers.map((c) => c.id) ?? []
        }
        initialCustomerIds={
          editingContact?.customers.map((c) => c.id) ?? []
        }
        onSave={handleSaveContact}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {deletingContact?.name}
              </span>
              ? This action cannot be undone.
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
              {deleting ? "Deleting..." : "Delete Contact"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
