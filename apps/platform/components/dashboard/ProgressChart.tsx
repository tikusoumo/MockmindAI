
"use client"

import { TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const chartData = [
  { month: "January", score: 65 },
  { month: "February", score: 72 },
  { month: "March", score: 78 },
  { month: "April", score: 75 },
  { month: "May", score: 82 },
  { month: "June", score: 88 },
]

const chartConfig = {
  score: {
    label: "Score",
    color: "#3b82f6",
  },
} satisfies ChartConfig

export function ProgressChart() {
  return (
    <Card>
      <CardHeader className="pb-0 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">Performance Trend</CardTitle>
        <CardDescription className="text-xs">
          Last 6 months
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              dataKey="score"
              type="natural"
              fill="var(--color-score)"
              fillOpacity={0.4}
              stroke="var(--color-score)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="py-2 px-4">
        <div className="flex w-full items-start gap-2 text-xs">
          <div className="grid gap-1">
            <div className="flex items-center gap-2 font-medium leading-none">
              Trending up by 5.2% <TrendingUp className="h-3 w-3 text-green-500" />
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
