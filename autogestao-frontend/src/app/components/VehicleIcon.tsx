import { Car, Bike, Truck } from "lucide-react";

interface VehicleIconProps {
  type?: "car" | "moto" | "truck";
  size?: number;
  className?: string;
}

export function VehicleIcon({ type = "car", size = 32, className }: VehicleIconProps) {
  const Icon = type === "moto" ? Bike : type === "truck" ? Truck : Car;
  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F4F6F9",
        color: "#CBD5E1",
        minHeight: 180,
      }}
    >
      <Icon size={size} />
    </div>
  );
}
