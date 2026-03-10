#include <stdio.h>
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
            if (a[j]%2==0) {
                printf("%d ", a[j]);
            }
        }
        printf("\n");
    }

    return 0;
}
