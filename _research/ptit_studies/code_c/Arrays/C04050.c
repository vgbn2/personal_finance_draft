/*
 * Filename: C04050.c
 * Description: C Program using functions: swap
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

void swap(int *a, int *b)
{
    int tg = *a;
    *a = *b;
    *b = tg;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int a[100];
    for (int i = 0; i < n; i++)
        scanf("%d", &a[i]); // Read input
    int check = 0;
    for (int i = 0; i < n - 1; i++)
    {
        int min = i;
        for (int j = i + 1; j < n; j++)
            if (a[j] < a[min])
                min = j;
        swap(&a[i], &a[min]);
        for (int j = 0; j < n; j++)
            printf("%d ", a[j]); // Print result
        printf("\n"); // Print result
    }
    return 0;
}