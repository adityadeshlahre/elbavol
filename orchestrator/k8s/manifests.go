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

func CreateNodeDevelopmentDeployment(
	clientSet *kubernetes.Clientset,
	namespace string,
	projectId string,
) error {
	replicaCount := int32(2)

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
							Name:            "controller",
							Image:           "aivalacoder/elbavol-control:latest",
							ImagePullPolicy: corev1.PullAlways,
							// Image:           "elbavol-control:latest",
							// ImagePullPolicy: corev1.PullNever,
							Env: []corev1.EnvVar{
								{
									Name:  "PROJECT_ID",
									Value: projectId,
								},
								{
									Name: "BUCKET_NAME", Value: "elbavol",
								},
								{
									Name:  "KAFKA_URL",
									Value: os.Getenv("KAFKA_URL"),
								},
								{
									Name: "SHARED_DIR", Value: "/app/shared",
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
									Name:  "MINIO_ENDPOINT",
									Value: os.Getenv("MINIO_ENDPOINT"),
								},
								{
									Name:  "MINIO_ACCESS_KEY",
									Value: os.Getenv("MINIO_ACCESS_KEY"),
								},
								{
									Name:  "MINIO_SECRET_KEY",
									Value: os.Getenv("MINIO_SECRET_KEY"),
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
							Name:            "serving",
							Image:           "aivalacoder/elbavol-serve:latest",
							ImagePullPolicy: corev1.PullAlways,
							// Image:           "elbavol-serve:latest",
							// ImagePullPolicy: corev1.PullNever,
							Env: []corev1.EnvVar{
								{
									Name:  "PROJECT_ID",
									Value: projectId,
								},
								{
									Name: "BUCKET_NAME", Value: "elbavol",
								},
								{
									Name:  "KAFKA_URL",
									Value: os.Getenv("KAFKA_URL"),
								},
								{
									Name: "SHARED_DIR", Value: "/app/shared",
								},
								{
									Name:  "MINIO_ENDPOINT",
									Value: os.Getenv("MINIO_ENDPOINT"),
								},
								{
									Name:  "MINIO_ACCESS_KEY",
									Value: os.Getenv("MINIO_ACCESS_KEY"),
								},
								{
									Name:  "MINIO_SECRET_KEY",
									Value: os.Getenv("MINIO_SECRET_KEY"),
								},
							},

							Ports: []corev1.ContainerPort{
								{
									ContainerPort: 3000,
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
			Name: strings.ToLower(projectId),
			Labels: map[string]string{
				"project": projectId,
			},
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{
				"project": projectId,
			},
			Ports: []corev1.ServicePort{
				{
					Name:       "vite",
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

func DeleteNodeDevelopmentDeployment(
	clientSet *kubernetes.Clientset,
	namespace string,
	projectId string,
) error {
	deletePolicy := metav1.DeletePropagationForeground
	err := clientSet.AppsV1().Deployments(namespace).Delete(
		context.Background(),
		"pod-"+strings.ToLower(projectId),
		metav1.DeleteOptions{
			PropagationPolicy: &deletePolicy,
		},
	)
	if err != nil {
		return fmt.Errorf("failed to delete pod development deployment: %v", err)
	}

	err = clientSet.CoreV1().Services(namespace).Delete(
		context.Background(),
		strings.ToLower(projectId),
		metav1.DeleteOptions{
			PropagationPolicy: &deletePolicy,
		},
	)
	if err != nil {
		return fmt.Errorf("failed to delete pod development service: %v", err)
	}

	return nil
}
