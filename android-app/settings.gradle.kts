pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "linux-server-toolkit"
include(":app")
include(":core:common", ":core:ui", ":core:database", ":core:network", ":core:security", ":core:testing", ":core:sync", ":core:knowledge", ":core:ssh")
include(":feature:dashboard", ":feature:tools", ":feature:settings", ":feature:knowledge", ":feature:servers")
