"use client"

import * as React from "react"
import Link from "next/link"
import { Mail, Pencil, Phone, Search, User, Users } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { Customer, CustomerContact } from "@/types/database"
import { CustomerMultiSelect } from "@/components/app/customer-multi-select"
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
import { Label } from "@/components/ui/label"
import { useUser } from "@/hooks/use-user"

type CustomerOption = Pick<Customer, "id" | "name" | "fortnox_customer_number">

type ContactWithCustomers = CustomerContact & {
  customers: CustomerOption[]
}

export default function ContactsPage() {
  const { isAdmin } = useUser()
  const [contacts, setContacts] = React.useState<ContactWithCustomers[]>([])
  const [allCustomers, setAllCustomers] = React.useState<CustomerOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [editingContact, setEditingContact] = React.useState<ContactWithCustomers | null>(null)
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)

  const fetchContacts = React.useCallback(async () => {
    const supabase = createClient()
    const { data: contactRows } = await supabase
      .from("customer_contacts")
      .select("*")
      .order("name")

    const contactsData = (contactRows ?? []) as unknown as CustomerContact[]
    const contactIds = contactsData.map((contact) => contact.id)
    const customerMap = new Map<string, CustomerOption[]>()

    if (contactIds.length > 0) {
      const { data: linkRows } = await supabase
        .from("customer_contact_links")
        .select("contact_id, customer:customers(id, name, fortnox_customer_number)")
        .in("contact_id", contactIds)

      for (const row of (linkRows ?? []) as unknown as Array<{
        contact_id: string
        customer: CustomerOption | null
      }>) {
        if (!row.customer) continue
        const existing = customerMap.get(row.contact_id) ?? []
        existing.push(row.customer)
        customerMap.set(row.contact_id, existing)
      }
    }

    const { data: customerRows } = await supabase
      .from("customers")
      .select("id, name, fortnox_customer_number")
      .eq("status", "active")
      .order("name")

    setAllCustomers((customerRows ?? []) as unknown as CustomerOption[])
    setContacts(
      contactsData.map((contact) => ({
        ...contact,
        customers: customerMap.get(contact.id) ?? [],
      }))
    )
    setLoading(false)
  }, [])

  React.useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  const filteredContacts = React.useMemo(() => {
    if (!search) return contacts
    const query = search.toLowerCase()
    return contacts.filter((contact) => {
      const customerNames = contact.customers.map((customer) => customer.name.toLowerCase()).join(" ")
      return [contact.name, contact.email ?? "", contact.role ?? "", customerNames]
        .join(" ")
        .toLowerCase()
        .includes(query)
    })
  }, [contacts, search])

  function openRelationDialog(contact: ContactWithCustomers) {
    setEditingContact(contact)
    setSelectedCustomerIds(contact.customers.map((customer) => customer.id))
  }

  async function handleSaveRelations() {
    if (!editingContact) return
    setSaving(true)

    const supabase = createClient()
    const existingCustomerIds = new Set(editingContact.customers.map((customer) => customer.id))
    const nextCustomerIds = Array.from(new Set(selectedCustomerIds))

    const customerIdsToAdd = nextCustomerIds.filter((customerId) => !existingCustomerIds.has(customerId))
    const customerIdsToRemove = editingContact.customers
      .map((customer) => customer.id)
      .filter((customerId) => !nextCustomerIds.includes(customerId))

    if (customerIdsToAdd.length > 0) {
      const { error } = await supabase.from("customer_contact_links").insert(
        customerIdsToAdd.map((customerId) => ({
          customer_id: customerId,
          contact_id: editingContact.id,
          relationship_label: null,
        })) as never
      )

      if (error) {
        setSaving(false)
        return
      }
    }

    if (customerIdsToRemove.length > 0) {
      const { error } = await supabase
        .from("customer_contact_links")
        .delete()
        .eq("contact_id", editingContact.id)
        .in("customer_id", customerIdsToRemove)

      if (error) {
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setEditingContact(null)
    setSelectedCustomerIds([])
    await fetchContacts()
  }

  if (!isAdmin) {
    return <div className="h-48 animate-pulse rounded-lg border bg-muted" />
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search contacts or customers..."
          className="pl-9"
        />
      </div>

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
          {filteredContacts.map((contact) => (
            <Card key={contact.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="flex items-start gap-3 text-base">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => openRelationDialog(contact)}
                  >
                    <Pencil className="size-4" />
                    <span className="sr-only">Edit customer relations</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Mail className="size-4" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                  )}
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Phone className="size-4" />
                      <span>{contact.phone}</span>
                    </a>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Related Customers
                  </p>
                  {contact.customers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No customer relations</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {contact.customers.map((customer) => (
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
          ))}
        </div>
      )}

      <Dialog open={Boolean(editingContact)} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer Relations</DialogTitle>
            <DialogDescription>
              Update which customers {editingContact?.name} is related to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Related Customers</Label>
              <CustomerMultiSelect
                customers={allCustomers}
                selectedIds={selectedCustomerIds}
                onChange={setSelectedCustomerIds}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingContact(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveRelations} disabled={saving}>
                {saving ? "Saving..." : "Save Relations"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
