output "namespace" {
  description = "Kubernetes namespace for the Sovereign web deployment."
  value       = kubernetes_namespace_v1.this.metadata[0].name
}

output "service_name" {
  description = "Kubernetes service name for the web front door."
  value       = kubernetes_service_v1.web.metadata[0].name
}

output "deployment_name" {
  description = "Kubernetes deployment name for the web workload."
  value       = kubernetes_deployment_v1.web.metadata[0].name
}

output "cluster_web_endpoint" {
  description = "Internal DNS address for the service."
  value       = "http://${kubernetes_service_v1.web.metadata[0].name}.${var.namespace}.svc.cluster.local:${var.service_port}"
}
