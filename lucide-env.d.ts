// src/shared/icons.ts deep path'lerle import ediyor (barrel'ın 1670 eager
// require'ından kaçmak için). Metro bunları çözüyor ama tsc çözemiyor:
// moduleResolution "bundler" paketin `exports` map'ine bakıyor, lucide ise
// yalnız "." ve "./icons" yayınlıyor — ikon başına subpath yok.
declare module "lucide-react-native/dist/esm/icons/*" {
  import type { LucideIcon } from "lucide-react-native";
  const icon: LucideIcon;
  export default icon;
}
