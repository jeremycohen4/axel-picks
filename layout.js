import "./globals.css";

export const metadata = {
  title: "Axel Picks",
  description: "AXEL Premier League prediction competition",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
