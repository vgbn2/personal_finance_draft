terraform {
  required_version = ">= 1.6.0"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }
}

provider "kubernetes" {}

locals {
  base_env = {
    NODE_ENV            = var.node_env
    SOVEREIGN_WEB_HOST  = "0.0.0.0"
    SOVEREIGN_WEB_PORT  = tostring(var.web_port)
    SOVEREIGN_WEB_TITLE = var.app_title
  }

  merged_env = merge(local.base_env, var.extra_env)
}

resource "kubernetes_namespace_v1" "this" {
  metadata {
    name = var.namespace
    labels = {
      app       = var.app_name
      component = "web"
    }
  }
}

resource "kubernetes_config_map_v1" "web" {
  metadata {
    name      = "${var.app_name}-config"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels = {
      app       = var.app_name
      component = "web"
    }
  }

  data = local.merged_env
}

resource "kubernetes_deployment_v1" "web" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels = {
      app       = var.app_name
      component = "web"
    }
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        app       = var.app_name
        component = "web"
      }
    }

    template {
      metadata {
        labels = {
          app       = var.app_name
          component = "web"
        }
      }

      spec {
        container {
          name              = "web"
          image             = var.image
          image_pull_policy = "IfNotPresent"
          command           = ["node", "backend/api/app.js"]

          port {
            name           = "http"
            container_port = var.web_port
            protocol       = "TCP"
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map_v1.web.metadata[0].name
            }
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = "http"
            }

            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 2
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = "http"
            }

            initial_delay_seconds = 20
            period_seconds        = 20
            timeout_seconds       = 2
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "web" {
  metadata {
    name      = "${var.app_name}-service"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels = {
      app       = var.app_name
      component = "web"
    }
  }

  spec {
    selector = {
      app       = var.app_name
      component = "web"
    }

    port {
      name        = "http"
      port        = var.service_port
      target_port = "http"
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}
