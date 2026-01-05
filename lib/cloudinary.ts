import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function uploadAudio(base64Data: string, filename: string): Promise<string> {
  try {
    const result = await cloudinary.uploader.upload(base64Data, {
      resource_type: 'video', // Cloudinary treats audio as video
      folder: 'whitelist-applications',
      public_id: filename,
      format: 'webm',
    })
    return result.secure_url
  } catch (error) {
    console.error('Cloudinary upload error:', error)
    throw new Error('Failed to upload audio')
  }
}

export async function deleteAudio(publicId: string): Promise<boolean> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' })
    return true
  } catch (error) {
    console.error('Cloudinary delete error:', error)
    return false
  }
}

export { cloudinary }
