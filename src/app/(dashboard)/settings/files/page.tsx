"use client"

import * as React from "react"
import { Download, FileText, FolderPlus, FolderTree, Loader2, Trash2, Upload } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import { useTranslation } from "@/hooks/use-translation"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_FILES_BUCKET ?? "crm-files"
const ROOT_FOLDER = process.env.NEXT_PUBLIC_SUPABASE_FILES_ROOT ?? "files"
const SERVICES_FOLDER_KEY = process.env.NEXT_PUBLIC_SUPABASE_SERVICES_FOLDER ?? "Tjanster"
const INITIAL_FOLDER = joinStoragePath(ROOT_FOLDER, SERVICES_FOLDER_KEY)
const EMPTY_FOLDER_PLACEHOLDER = ".emptyFolderPlaceholder"

type StorageListItem = {
  id: string | null
  name: string
  metadata?: {
    size?: number
  } | null
  updated_at?: string
}

type DeleteTarget = {
  name: string
  kind: "file" | "folder"
}

function joinStoragePath(...parts: string[]): string {
  return parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter((part) => part.length > 0)
    .join("/")
}

function sanitizeStorageSegment(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized
}

function normalizeFolderName(value: string): string {
  return sanitizeStorageSegment(value)
}

function normalizeFileName(value: string): string {
  const trimmed = value.trim()
  const extensionIndex = trimmed.lastIndexOf(".")

  if (extensionIndex <= 0 || extensionIndex === trimmed.length - 1) {
    return sanitizeStorageSegment(trimmed)
  }

  const baseName = sanitizeStorageSegment(trimmed.slice(0, extensionIndex))
  const extension = sanitizeStorageSegment(trimmed.slice(extensionIndex + 1)).toLowerCase()

  if (!baseName) {
    return extension ? `file.${extension}` : "file"
  }

  return extension ? `${baseName}.${extension}` : baseName
}

function renderSegmentLabel(segment: string, t: (key: string, fallback?: string) => string): string {
  if (segment === SERVICES_FOLDER_KEY) {
    return t("settings.files.servicesFolder", "Tjänster")
  }

  return segment
}

function getCurrentFolderLabel(
  currentFolder: string,
  t: (key: string, fallback?: string) => string,
): string {
  const segments = currentFolder.split("/").filter(Boolean)
  const lastSegment = segments[segments.length - 1]

  if (!lastSegment) {
    return t("settings.tabs.files", "Files")
  }

  return renderSegmentLabel(lastSegment, t)
}

function formatBytes(value: number | undefined): string {
  if (!value || value <= 0) return "-"
  if (value < 1024) return `${value} B`

  const units = ["KB", "MB", "GB"]
  let size = value / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

export default function SettingsFilesPage() {
  const { isAdmin } = useUser()
  const { t } = useTranslation()

  const [currentFolder, setCurrentFolder] = React.useState(INITIAL_FOLDER)
  const [items, setItems] = React.useState<StorageListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [creatingFolder, setCreatingFolder] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [deletingPath, setDeletingPath] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)
  const [folderName, setFolderName] = React.useState("")
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)

  const pathSegments = React.useMemo(() => currentFolder.split("/").filter(Boolean), [currentFolder])
  const canUploadToCurrentFolder = currentFolder !== ROOT_FOLDER
  const currentFolderLabel = React.useMemo(() => getCurrentFolderLabel(currentFolder, t), [currentFolder, t])

  const loadFolder = React.useCallback(async (folderPath: string) => {
    const supabase = createClient()
    setLoading(true)

    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(folderPath, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    })

    if (error) {
      toast.error(error.message || "Failed to load files")
      setItems([])
      setLoading(false)
      return
    }

    const filteredItems = (data ?? []).filter((item) => item.name !== EMPTY_FOLDER_PLACEHOLDER)
    setItems(filteredItems as StorageListItem[])
    setLoading(false)
  }, [])

  React.useEffect(() => {
    void loadFolder(currentFolder)
  }, [currentFolder, loadFolder])

  React.useEffect(() => {
    const supabase = createClient()

    async function ensureRootFolder() {
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(joinStoragePath(ROOT_FOLDER, EMPTY_FOLDER_PLACEHOLDER), new Blob([]), {
          contentType: "text/plain",
          upsert: false,
        })

      if (error) {
        return
      }

      const { error: servicesError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(joinStoragePath(INITIAL_FOLDER, EMPTY_FOLDER_PLACEHOLDER), new Blob([]), {
          contentType: "text/plain",
          upsert: false,
        })

      if (!servicesError) {
        await loadFolder(INITIAL_FOLDER)
      }
    }

    void ensureRootFolder()
  }, [loadFolder])

  async function handleCreateFolder() {
    const normalizedFolderName = normalizeFolderName(folderName)
    if (!normalizedFolderName) {
      toast.error("Folder name is required")
      return
    }

    setCreatingFolder(true)
    const supabase = createClient()
    const placeholderPath = joinStoragePath(
      currentFolder,
      normalizedFolderName,
      EMPTY_FOLDER_PLACEHOLDER,
    )

    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(placeholderPath, new Blob([]), {
      contentType: "text/plain",
      upsert: false,
    })

    if (error) {
      toast.error(error.message || "Failed to create folder")
      setCreatingFolder(false)
      return
    }

    toast.success("Folder created")
    setFolderName("")
    setCreatingFolder(false)
    await loadFolder(currentFolder)
  }

  async function handleUploadFile() {
    if (!selectedFile) {
      toast.error("Choose a file first")
      return
    }

    setUploading(true)
    const supabase = createClient()
    const normalizedFileName = normalizeFileName(selectedFile.name)
    const objectPath = joinStoragePath(currentFolder, `${crypto.randomUUID()}-${normalizedFileName || "file"}`)

    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, selectedFile, {
      contentType: selectedFile.type || "application/octet-stream",
      upsert: false,
    })

    if (error) {
      toast.error(error.message || "Failed to upload file")
      setUploading(false)
      return
    }

    toast.success("File uploaded")
    setSelectedFile(null)
    setUploading(false)
    await loadFolder(currentFolder)
  }

  async function handleDownloadFile(itemName: string) {
    const supabase = createClient()
    const objectPath = joinStoragePath(currentFolder, itemName)
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(objectPath)

    if (error || !data) {
      toast.error(error?.message || "Failed to download file")
      return
    }

    const downloadUrl = URL.createObjectURL(data)
    const link = document.createElement("a")
    link.href = downloadUrl
    link.download = itemName
    link.click()
    URL.revokeObjectURL(downloadUrl)
  }

  async function handleDeleteFile(itemName: string) {
    const objectPath = joinStoragePath(currentFolder, itemName)
    const supabase = createClient()

    setDeletingPath(objectPath)
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([objectPath])

    if (error) {
      toast.error(error.message || "Failed to delete file")
      setDeletingPath(null)
      return
    }

    toast.success("File deleted")
    setDeleteTarget(null)
    setDeletingPath(null)
    await loadFolder(currentFolder)
  }

  async function collectFolderObjectPaths(folderPath: string): Promise<string[]> {
    const supabase = createClient()
    const queue = [folderPath]
    const objectPaths: string[] = []

    while (queue.length > 0) {
      const nextPath = queue.shift()
      if (!nextPath) {
        continue
      }

      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(nextPath, {
        limit: 100,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      })

      if (error) {
        throw new Error(error.message || "Failed to read folder")
      }

      for (const item of data ?? []) {
        const itemPath = joinStoragePath(nextPath, item.name)
        if (item.id === null) {
          queue.push(itemPath)
        } else {
          objectPaths.push(itemPath)
        }
      }
    }

    return objectPaths
  }

  async function handleDeleteFolder(folderName: string) {
    const folderPath = joinStoragePath(currentFolder, folderName)
    const supabase = createClient()

    setDeletingPath(folderPath)

    try {
      const objectPaths = await collectFolderObjectPaths(folderPath)

      if (objectPaths.length === 0) {
        setDeleteTarget(null)
        setDeletingPath(null)
        await loadFolder(currentFolder)
        return
      }

      const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(objectPaths)
      if (error) {
        toast.error(error.message || "Failed to delete folder")
        setDeletingPath(null)
        return
      }

      toast.success("Folder deleted")
      setDeleteTarget(null)
      setDeletingPath(null)
      await loadFolder(currentFolder)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete folder"
      toast.error(message)
      setDeletingPath(null)
    }
  }

  if (!isAdmin) {
    return <div className="h-40 rounded-lg border bg-muted/20" />
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.tabs.files", "Files")}</CardTitle>
          <CardDescription>
            Upload and organize files in folders for future AI references.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {pathSegments.map((segment, index) => {
              const segmentPath = pathSegments.slice(0, index + 1).join("/")
              const isLast = index === pathSegments.length - 1

              return (
                <React.Fragment key={segmentPath}>
                  <Button
                    variant={isLast ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setCurrentFolder(segmentPath)}
                  >
                    {renderSegmentLabel(segment, t)}
                  </Button>
                  {!isLast ? <span className="text-muted-foreground">/</span> : null}
                </React.Fragment>
              )
            })}

          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder={`New folder inside ${currentFolderLabel}`}
            />
            <Button onClick={handleCreateFolder} disabled={creatingFolder}>
              {creatingFolder ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
              Create folder
            </Button>
          </div>

          {canUploadToCurrentFolder ? (
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
              <Button onClick={handleUploadFile} disabled={uploading || !selectedFile}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Upload file
              </Button>
            </div>
          ) : null}

          {loading ? (
            <div className="h-24 animate-pulse rounded-md border bg-muted/20" />
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No files or folders yet in this path.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const isFolder = item.id === null

                return (
                  <div
                    key={`${item.name}-${item.updated_at ?? ""}`}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {isFolder ? (
                        <FolderTree className="size-4 text-muted-foreground" />
                      ) : (
                        <FileText className="size-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isFolder ? "Folder" : formatBytes(item.metadata?.size)}
                        </p>
                      </div>
                    </div>

                    {isFolder ? (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCurrentFolder(joinStoragePath(currentFolder, item.name))}>
                          Open
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setDeleteTarget({ name: item.name, kind: "folder" })}
                          disabled={deletingPath === joinStoragePath(currentFolder, item.name)}
                        >
                          {deletingPath === joinStoragePath(currentFolder, item.name) ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          <span className="sr-only">Delete folder</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleDownloadFile(item.name)}>
                          <Download className="size-4" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setDeleteTarget({ name: item.name, kind: "file" })}
                          disabled={deletingPath === joinStoragePath(currentFolder, item.name)}
                        >
                          {deletingPath === joinStoragePath(currentFolder, item.name) ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          <span className="sr-only">Delete file</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget?.kind === "folder" ? "Delete folder" : "Delete file"}
        description={deleteTarget ? `Permanently delete "${deleteTarget.name}"?` : "Permanently delete item?"}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteTarget ? deletingPath === joinStoragePath(currentFolder, deleteTarget.name) : false}
        onConfirm={async () => {
          if (!deleteTarget) return
          if (deleteTarget.kind === "folder") {
            await handleDeleteFolder(deleteTarget.name)
            return
          }

          await handleDeleteFile(deleteTarget.name)
        }}
      />
    </div>
  )
}
