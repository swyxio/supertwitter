import { get, set, del } from 'idb-keyval'
import { useEffect, useState } from 'react'

export type Attachment = { key: string; alt: string }
export type Upload = { dataUrl: string; alt?: string }
export async function saveFile(file: File): Promise<Attachment> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    !file.size ||
    file.size > 2 * 1024 * 1024
  ) {
    throw new Error('Choose a JPEG, PNG, or WebP image up to 2 MiB.')
  }
  const key = 'local-image:' + crypto.randomUUID()
  await set(key, file)
  return { key, alt: '' }
}
export const releaseFile = (key: string) => del(key)
export async function readUpload(image: Attachment): Promise<Upload> {
  const blob = await get<Blob>(image.key)
  if (!blob)
    throw new Error(
      'The attachment is missing from this browser. Attach the image again.'
    )
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read this image.'))
    reader.readAsDataURL(blob)
  })
  return { dataUrl, alt: image.alt }
}
export function useImageUrl(url: string) {
  const [resolved, update] = useState('')
  useEffect(() => {
    if (!url.startsWith('local-image:')) return
    let active = true
    let created = ''
    get<Blob>(url)
      .then((blob) => {
        if (blob && active) {
          created = URL.createObjectURL(blob)
          update(created)
        }
      })
      .catch(() => {})
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [url])
  return url.startsWith('local-image:') ? resolved : url
}
