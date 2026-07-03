import { ImgHTMLAttributes } from 'react'

export const SITE_LOGO_URL = '/site-logo.png'

export function SiteLogo({ className = 'site-logo-img', alt = 'DNS.ccocc', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img className={className} src={SITE_LOGO_URL} alt={alt} {...props} />
}
