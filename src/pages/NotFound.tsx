import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { Logo3D } from "@/components/Logo3D";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6">
      <Logo3D size={72} showWordmark wordmarkFontSize={32} />
      <div className="text-center">
        <h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-4 text-lg text-muted-foreground">{t("notFound.title")}</p>
        <Link to="/" className="text-primary underline hover:text-primary/80">
          {t("notFound.actions.backHome")}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
