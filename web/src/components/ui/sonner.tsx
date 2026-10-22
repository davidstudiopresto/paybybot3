import { Toaster as Sonner, type ToasterProps } from "sonner"

// Light-only app: no theme provider needed.
const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="light"
    position="top-right"
    richColors
    className="toaster group"
    toastOptions={{ style: { fontFamily: "var(--font-sans)", fontSize: "1rem" } }}
    {...props}
  />
)

export { Toaster }
