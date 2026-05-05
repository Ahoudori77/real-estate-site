import type { Property } from "../types/property";

export const mockProperties: Property[] = [
  {
    id: "1",
    title: "○○市の売土地",
    type: "land",
    price: 12800000,
    location: "兵庫県○○市",
    landArea: 132.4,
    imageUrl: "/images/dummy/property-01.jpg",
    featured: true,
    published: true,
  },
  {
    id: "2",
    title: "△△町の中古戸建",
    type: "house",
    price: 24800000,
    location: "兵庫県△△町",
    landArea: 145.8,
    buildingArea: 96.2,
    layout: "4LDK",
    imageUrl: "/images/dummy/property-02.jpg",
    featured: true,
    published: true,
  },
  {
    id: "3",
    title: "□□エリアの売土地",
    type: "land",
    price: 9800000,
    location: "兵庫県□□市",
    landArea: 118.0,
    imageUrl: "/images/dummy/property-03.jpg",
    featured: true,
    published: true,
  },
];