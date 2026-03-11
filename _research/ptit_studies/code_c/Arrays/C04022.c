/*
 * Filename: C04022.c
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
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int a[100];
    for (int i = 0; i < n; i++)
        scanf("%d", &a[i]); // Read input
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++)
            swap(&a[i], &a[j]);
    printf("%d ", a[0]); // Print result
    for (int i = 1; i < n; i++)
        if (a[i] < a[0])
        {
            printf("%d", a[i]); // Print result
            break;
        }
    return 0;
}