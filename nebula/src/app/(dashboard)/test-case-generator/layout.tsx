import Navigation from "@/components/navigation";
import React from "react";

type Props = {
  children: React.ReactNode;
};

const layout = ({ children }: Props) => {
  return (
    <div>
      <Navigation />
      {children}
    </div>
  );
};

export default layout;
