/*
 * Filename: C01031.c
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
#include <math.h>

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    for (int i = 2; i <= sqrt(n); i++)
    {
        while (n % i == 0)
        {
            n /= i;
            printf("%d", i); // Print result
            if (n != 1)
                printf("x"); // Print result
            else
                return 0;
        }
    }
    printf("%d", n); // Print result
    return 0;
}