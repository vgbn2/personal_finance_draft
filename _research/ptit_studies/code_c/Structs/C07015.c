/*
 * Filename: C07015.c
 * Description: Calculates sums using functions: init
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <string.h>

struct Student
{
    char name[100], date[100];
    float d1, d2, d3, sum;
};

void init(struct Student sv[], int n, int i)
{
    fflush(stdin);
    scanf("\n%[^\n]s", sv[i].name); // Read input
    scanf("%s", sv[i].date); // Read input
    scanf("%f %f %f", &sv[i].d1, &sv[i].d2, &sv[i].d3); // Read input
    sv[i].sum = sv[i].d1 + sv[i].d2 + sv[i].d3;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    struct Student sv[n];
    for (int i = 0; i < n; i++)
        init(sv, n, i);
    float max = 0;
    for (int i = 0; i < n; i++)
        if (sv[i].sum > max)
            max = sv[i].sum;
    for (int i = 0; i < n; i++)
        if (sv[i].sum == max)
            printf("%d %s %s %.1f\n", i + 1, sv[i].name, sv[i].date, sv[i].sum); // Print result
    return 0;
}