#include <stdio.h>
#include <math.h>

int ngto(int num) {
    if (num < 2) return 0;
    if (num == 2 || num == 3) return 1;
    if (num % 2 == 0) return 0;
    for (int i = 3; i <= sqrt(num); i += 2) {
        if (num % i == 0) return 0;
    }
    return 1;
}

int main() {
    int t, n;
    scanf("%d", &t);

    for (int i = 0; i < t; i++) {
        scanf("%d", &n);
        int a[n];

        for (int j = 0; j < n; j++) {
            scanf("%d", &a[j]);
        }

        for (int j = 0; j < n; j++) {
            if (ngto(a[j])) {
                printf("%d ", a[j]);
            }
        }
        printf("\n");
    }

    return 0;
}
