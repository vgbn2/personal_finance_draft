variable "namespace" {
  description = "Namespace used for the Sovereign web deployment."
  type        = string
  default     = "sovereign"
}

variable "app_name" {
  description = "Base app name used for Kubernetes object names."
  type        = string
  default     = "sovereign-web"
}

variable "app_title" {
  description = "Optional dashboard title propagated into the container environment."
  type        = string
  default     = "Sovereign Trading Platform"
}

variable "image" {
  description = "Container image that contains the web/app.js entrypoint."
  type        = string
  default     = "ghcr.io/vgbn2/personal_finance_draft-web:latest"
}

variable "replicas" {
  description = "Number of web replicas."
  type        = number
  default     = 2
}

variable "web_port" {
  description = "Container port exposed by web/app.js."
  type        = number
  default     = 8787
}

variable "service_port" {
  description = "Cluster service port."
  type        = number
  default     = 80
}

variable "node_env" {
  description = "Node environment passed to the deployment."
  type        = string
  default     = "production"
}

variable "extra_env" {
  description = "Extra environment variables merged into the ConfigMap."
  type        = map(string)
  default     = {}
}
