/*
 * Filename: C04013.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int a[100], dd[100005] = {0};
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        dd[a[i]]++;
    }
    int b[100], nb = 0;
    for (int i = 0; i < n; i++)
        if (dd[a[i]] == 1)
            b[nb++] = a[i];
    printf("%d\n", nb); // Print result
    for (int i = 0; i < nb; i++)
        printf("%d ", b[i]); // Print result
    return 0;
}