import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Gamepad2, Users, CreditCard, Trophy, ShoppingCart, Activity } from "lucide-react"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            v0.0.1
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4">
            TCG Engine API
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            REST API for Trading Card Game services including cards, users, matches, rewards, and marketplace.
          </p>
        </div>

        {/* API Features Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-16">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Cards & Decks</CardTitle>
              </div>
              <CardDescription>
                Manage card collections, deck building, and card variants
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">/api/cards</Badge>
                <Badge variant="outline">/api/decks</Badge>
                <Badge variant="outline">/api/variants</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Users</CardTitle>
              </div>
              <CardDescription>
                User authentication, profiles, and friend management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">/api/users</Badge>
                <Badge variant="outline">/api/auth</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Matches</CardTitle>
              </div>
              <CardDescription>
                Game matches, ELO rankings, and competitive play
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">/api/matches</Badge>
                <Badge variant="outline">/api/rewards</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Marketplace</CardTitle>
              </div>
              <CardDescription>
                Card trading, market listings, and transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">/api/market</Badge>
                <Badge variant="outline">/api/trades</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Packs</CardTitle>
              </div>
              <CardDescription>
                Card packs, opening mechanics, and rewards
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">/api/packs</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Activity</CardTitle>
              </div>
              <CardDescription>
                Activity logs, admin management, and real-time events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">/api/activity</Badge>
                <Badge variant="outline">/ws</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg">
            <a href="/health">Health Check</a>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="/admin">Admin Dashboard</a>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="/setup">Setup Wizard</a>
          </Button>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-sm text-muted-foreground">
          <p>Supports MongoDB, MySQL, PostgreSQL, and MSSQL databases</p>
        </div>
      </div>
    </main>
  )
}
