"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, BarChart3, Upload } from "lucide-react";
import Link from "next/link";

const stats = [
  { label: "Total Templates", value: "12", icon: FileText, href: "/admin/templates" },
  { label: "Active Users", value: "156", icon: Users, href: "/admin/users" },
  { label: "Interviews Today", value: "34", icon: BarChart3, href: "#" },
  { label: "Documents Indexed", value: "89", icon: Upload, href: "/admin/templates" },
];

export default function AdminDashboard() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Manage templates, users, and system settings.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.label}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/admin/templates/new">
            <Card className="p-4 hover:bg-secondary/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Create Template</p>
                  <p className="text-sm text-muted-foreground">
                    Add new interview template
                  </p>
                </div>
              </div>
            </Card>
          </Link>
          
          <Link href="/admin/templates">
            <Card className="p-4 hover:bg-secondary/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Upload className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="font-medium">Upload Documents</p>
                  <p className="text-sm text-muted-foreground">
                    Add question banks & rubrics
                  </p>
                </div>
              </div>
            </Card>
          </Link>
          
          <Link href="/admin/users">
            <Card className="p-4 hover:bg-secondary/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium">Manage Users</p>
                  <p className="text-sm text-muted-foreground">
                    View user activity
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
