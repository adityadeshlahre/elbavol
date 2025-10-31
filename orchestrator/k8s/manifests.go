package k8s

import (
	"context"
	"fmt"
	"os"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

func CreatePodDevelopmentDeployment(
	clientSet *kubernetes.Clientset,
	namespace string,
	projectId string,
) error {
	replicaCount := int32(1)

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name: "pod-" + strings.ToLower(projectId),
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicaCount,

			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"project": projectId,
				},
			},

			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"project": projectId,
					},
				},

				Spec: corev1.PodSpec{
					Volumes: []corev1.Volume{
						{
							Name: "shared",
							VolumeSource: corev1.VolumeSource{
								EmptyDir: &corev1.EmptyDirVolumeSource{},
							},
						},
					},
					Containers: []corev1.Container{
						{
							Name:  "controller",
							Image: fmt.Sprintf("%s/elbavol-controller:latest", os.Getenv("DOCKER_USER_NAME")),
							Env: []corev1.EnvVar{
								{
									Name:  "PROJECT_ID",
									Value: projectId,
								},
								{
									Name: "BUCKET_NAME", Value: "elbavol",
								},
								{
									Name: "KAFKA_URL", Value: "kafka-service:9092",
								},
								{
									Name:  "GOOGLE_API_KEY",
									Value: os.Getenv("GOOGLE_API_KEY"),
								},
								{
									Name:  "OPENROUTER_API_KEY",
									Value: os.Getenv("OPENROUTER_API_KEY"),
								},
								{
									Name:  "CLOUDFLARE_ACCOUNT_ID",
									Value: os.Getenv("CF_ACCOUNT_ID"),
								},
								{
									Name:  "CLOUDFLARE_ACCESS_KEY_ID",
									Value: os.Getenv("CF_ACCESS_KEY_ID"),
								},
								{
									Name:  "CLOUDFLARE_SECRET_ACCESS_KEY",
									Value: os.Getenv("CF_SECRET_ACCESS_KEY"),
								},
							},
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "shared",
									MountPath: "/app/shared",
								},
							},
						},

						{
							Name:  "serving",
							Image: fmt.Sprintf("%s/elbavol-serving:latest", os.Getenv("DOCKER_USER_NAME")),
							Env: []corev1.EnvVar{
								{
									Name:  "PROJECT_ID",
									Value: projectId,
								},
								{
									Name: "BUCKET_NAME", Value: "elbavol",
								},
								{
									Name: "KAFKA_URL", Value: "kafka-service:9092",
								},
								{
									Name:  "CLOUDFLARE_ACCOUNT_ID",
									Value: os.Getenv("CF_ACCOUNT_ID"),
								},
								{
									Name:  "CLOUDFLARE_ACCESS_KEY_ID",
									Value: os.Getenv("CF_ACCESS_KEY_ID"),
								},
								{
									Name:  "CLOUDFLARE_SECRET_ACCESS_KEY",
									Value: os.Getenv("CF_SECRET_ACCESS_KEY"),
								},
							},

							Ports: []corev1.ContainerPort{
								{
									ContainerPort: 5173,
								},
								{
									ContainerPort: 3000,
								},
								{
									ContainerPort: 3001,
								},
								{
									ContainerPort: 8080,
								},
							},
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "shared",
									MountPath: "/app/shared",
								},
							},
						},
					},
				},
			},
		},
	}

	_, err := clientSet.AppsV1().Deployments(namespace).Create(context.Background(), deployment, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create pod development deployment: %v", err)
	}

	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name: "service-" + strings.ToLower(projectId),
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{
				"project": projectId,
			},
			Ports: []corev1.ServicePort{
				{
					Name:       "http",
					Port:       3000,
					TargetPort: intstr.FromInt(3000),
				},
			},
			Type: corev1.ServiceTypeClusterIP,
		},
	}

	_, err = clientSet.CoreV1().Services(namespace).Create(context.Background(), service, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create pod development service: %v", err)
	}

	return nil
}
